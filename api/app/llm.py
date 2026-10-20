# Wired (2026-06-28): probe_provider() is called by the Settings "Test connection"
# endpoint (POST /api/settings/llm/test) to validate the configured provider /
# host / model. generate() remains available for future scanner-side LLM use;
# bridge dispatch + circuit breaker back both paths.
"""
netmap — LLM client (Ollama / Claude bridge dispatch).

Reads LLM_PROVIDER env at module load:
  - "ollama" (default) → direct Ollama at OLLAMA_HOST
  - "claude"           → HTTP LLM bridge at CLAUDE_BRIDGE_URL

Always sends X-App-Name on bridge calls so the bridge can label /metrics
and apply per-app rate-limit / allowlist policy.

Sync httpx for simplicity — netmap routes are not high-volume.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger("netmap.llm")

APP_NAME = "netmap"

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").lower()
CLAUDE_BRIDGE_URL = os.getenv("CLAUDE_BRIDGE_URL", "http://host.docker.internal:7777")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "sonnet").lower()
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

_TIMEOUT_S = 130.0

# Graceful degradation: after this many consecutive dispatch failures the
# breaker opens and generate() fails fast instead of hammering a dead provider.
# It half-opens after _BREAKER_RESET_S so the next call probes for recovery.
_BREAKER_THRESHOLD = 5
_BREAKER_RESET_S = 300.0


class LLMError(RuntimeError):
    """Raised on any LLM dispatch failure."""


class _Breaker:
    """Minimal module-level circuit breaker (no external deps).

    closed  → calls allowed.
    open    → calls short-circuited until _BREAKER_RESET_S elapses, then probes.
    """

    def __init__(self, threshold: int, reset_s: float) -> None:
        self.threshold = threshold
        self.reset_s = reset_s
        self.failures = 0
        self.opened_at = 0.0

    def is_open(self) -> bool:
        if self.failures < self.threshold:
            return False
        if time.monotonic() - self.opened_at >= self.reset_s:
            # half-open: allow one probe call through
            return False
        return True

    def record_success(self) -> None:
        self.failures = 0
        self.opened_at = 0.0

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures == self.threshold:
            self.opened_at = time.monotonic()
            logger.warning(
                "LLM circuit breaker OPEN — %d consecutive failures, retry in %.0fs",
                self.failures,
                self.reset_s,
            )


_breaker = _Breaker(_BREAKER_THRESHOLD, _BREAKER_RESET_S)


def _bridge_headers() -> dict[str, str]:
    h = {"Content-Type": "application/json", "X-App-Name": APP_NAME}
    token = os.getenv("CLAUDE_BRIDGE_TOKEN")
    if token:
        h["X-Bridge-Token"] = token
    return h


def _generate_via_claude_bridge(prompt: str, system: Optional[str] = None) -> str:
    payload: dict[str, object] = {"prompt": prompt, "model": CLAUDE_MODEL}
    if system:
        payload["system"] = system
    try:
        with httpx.Client(timeout=_TIMEOUT_S) as client:
            res = client.post(
                f"{CLAUDE_BRIDGE_URL}/generate",
                json=payload,
                headers=_bridge_headers(),
            )
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        raise LLMError(f"LLM provider unavailable: Claude bridge at {CLAUDE_BRIDGE_URL} ({exc})") from exc
    except httpx.HTTPError as exc:
        raise LLMError(f"Claude bridge unreachable: {exc}") from exc

    if res.status_code >= 400:
        detail = res.text[:400] if res.text else f"HTTP {res.status_code}"
        raise LLMError(f"Claude bridge HTTP {res.status_code}: {detail}")

    data = res.json()
    if not data.get("ok"):
        raise LLMError(f"Claude bridge: {data.get('error', 'unknown error')}")
    return data.get("response", "")


def _generate_via_ollama(prompt: str, system: Optional[str] = None) -> str:
    payload: dict[str, object] = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        payload["system"] = system
    try:
        with httpx.Client(timeout=_TIMEOUT_S) as client:
            res = client.post(f"{OLLAMA_HOST}/api/generate", json=payload)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        raise LLMError(f"LLM provider unavailable: Ollama at {OLLAMA_HOST} ({exc})") from exc
    except httpx.HTTPError as exc:
        raise LLMError(f"Ollama unreachable at {OLLAMA_HOST}: {exc}") from exc

    if res.status_code >= 400:
        raise LLMError(f"Ollama HTTP {res.status_code}: {res.text[:400]}")

    return res.json().get("response", "")


def generate(prompt: str, system: Optional[str] = None) -> str:
    """
    Generate text via the active provider.

    Args:
        prompt:  user prompt
        system:  optional system prompt

    Returns:
        Generated text (empty string if model returned nothing).

    Raises:
        LLMError: on any provider failure, or immediately if the circuit
            breaker is open after repeated consecutive failures.
    """
    if _breaker.is_open():
        raise LLMError(
            f"LLM provider unavailable: circuit breaker open after "
            f"{_breaker.failures} consecutive failures"
        )

    try:
        if LLM_PROVIDER == "claude":
            result = _generate_via_claude_bridge(prompt, system)
        else:
            result = _generate_via_ollama(prompt, system)
    except LLMError:
        _breaker.record_failure()
        raise

    _breaker.record_success()
    return result.strip()


def check_connection() -> bool:
    """Health probe for the active provider — returns True on 2xx."""
    target = (
        f"{CLAUDE_BRIDGE_URL}/health"
        if LLM_PROVIDER == "claude"
        else f"{OLLAMA_HOST}/api/tags"
    )
    try:
        with httpx.Client(timeout=5.0) as client:
            return client.get(target).is_success
    except httpx.HTTPError:
        return False


def ollama_model_pulled(model: str, names: set[str]) -> bool:
    """True when ``model`` is among the pulled Ollama models.

    The tag must match: "qwen2.5:7b" is not available just because
    "qwen2.5:14b" is pulled. A model given without a tag means ":latest".
    """
    want = model if ":" in model else f"{model}:latest"
    return want in names


def probe_provider(
    provider: str,
    *,
    ollama_host: Optional[str] = None,
    ollama_model: Optional[str] = None,
    bridge_url: Optional[str] = None,
    claude_model: Optional[str] = None,
    bridge_token: Optional[str] = None,
) -> dict[str, object]:
    """Health-probe a specific provider with explicit (settings-driven) config.

    Unlike ``check_connection()`` — which reads the module-level env config — this
    probes the host/model the caller passes in, so the Settings "Test connection"
    button can validate what the user has entered without restarting the process.
    Never raises: every failure is reported in the returned dict.

    Returns:
        {"ok": bool, "provider": str, "model": str, "detail": str,
         "model_available": Optional[bool]}
    """
    provider = (provider or "ollama").lower()

    if provider == "claude":
        url = (bridge_url or CLAUDE_BRIDGE_URL).rstrip("/")
        model = (claude_model or CLAUDE_MODEL).lower()
        headers = {"X-App-Name": APP_NAME}
        token = bridge_token if bridge_token is not None else os.getenv("CLAUDE_BRIDGE_TOKEN")
        if token:
            headers["X-Bridge-Token"] = token
        try:
            with httpx.Client(timeout=8.0) as client:
                res = client.get(f"{url}/health", headers=headers)
        except httpx.HTTPError as exc:
            return {
                "ok": False,
                "provider": "claude",
                "model": model,
                "detail": f"Claude bridge unreachable at {url}: {exc}",
                "model_available": None,
            }
        ok = res.is_success
        return {
            "ok": ok,
            "provider": "claude",
            "model": model,
            "detail": "Claude bridge reachable" if ok else f"Claude bridge HTTP {res.status_code}",
            "model_available": None,
        }

    # Default: ollama
    host = (ollama_host or OLLAMA_HOST).rstrip("/")
    model = ollama_model or OLLAMA_MODEL
    try:
        with httpx.Client(timeout=8.0) as client:
            res = client.get(f"{host}/api/tags")
    except httpx.HTTPError as exc:
        return {
            "ok": False,
            "provider": "ollama",
            "model": model,
            "detail": f"Ollama unreachable at {host}: {exc}",
            "model_available": None,
        }
    if not res.is_success:
        return {
            "ok": False,
            "provider": "ollama",
            "model": model,
            "detail": f"Ollama HTTP {res.status_code}",
            "model_available": None,
        }
    names = {m.get("name", "") for m in res.json().get("models", [])}
    model_available = ollama_model_pulled(model, names)
    detail = "Ollama reachable" if model_available else f"Ollama reachable — model '{model}' not pulled"
    return {
        "ok": True,
        "provider": "ollama",
        "model": model,
        "detail": detail,
        "model_available": model_available,
    }


def get_active_model() -> str:
    """Returns the model the next generate() call will use."""
    return CLAUDE_MODEL if LLM_PROVIDER == "claude" else OLLAMA_MODEL


def get_provider() -> str:
    """Returns 'claude' or 'ollama'."""
    return "claude" if LLM_PROVIDER == "claude" else "ollama"
