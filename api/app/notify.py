"""Outbound scan-event notifications (webhook POST).

Driven by AppSettings (notify_enabled, notify_webhook_url, notify_on_*). The
webhook URL is stored encrypted at rest; callers pass the already-decrypted URL.

Best-effort by design: any failure is logged and swallowed — a notification must
never fail a scan. Payload uses a top-level ``text`` field so it renders directly
in Slack / Discord / Mattermost incoming webhooks, while keeping the structured
fields for custom consumers.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger("netmap.notify")

_TIMEOUT_S = 10.0


async def send_scan_notification(
    *,
    webhook_url: str,
    event: str,
    scan_id: int,
    target_ip: str,
    status: str,
    device_count: int = 0,
    link_count: int = 0,
    error_message: Optional[str] = None,
) -> bool:
    """POST a scan-event payload to ``webhook_url``. Returns True on 2xx.

    Never raises — logs and returns False on any failure.
    """
    if not webhook_url:
        return False

    if status == "completed":
        summary = (
            f"NetMap scan #{scan_id} ({target_ip}) completed: "
            f"{device_count} devices, {link_count} links"
        )
    else:
        summary = (
            f"NetMap scan #{scan_id} ({target_ip}) failed: "
            f"{error_message or 'unknown error'}"
        )

    payload = {
        "event": event,
        "text": summary,
        "scan_id": scan_id,
        "target_ip": target_ip,
        "status": status,
        "device_count": device_count,
        "link_count": link_count,
        "error_message": error_message,
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            res = await client.post(webhook_url, json=payload)
    except httpx.HTTPError as exc:
        logger.warning("Scan %d notification failed: %s", scan_id, exc)
        return False

    if res.is_success:
        logger.info("Scan %d notification delivered (%s)", scan_id, event)
        return True
    logger.warning("Scan %d notification HTTP %d", scan_id, res.status_code)
    return False
