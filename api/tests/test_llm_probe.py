"""Settings "Test connection": an Ollama model counts only when that exact tag is pulled."""

import httpx

from app import llm
from app.llm import ollama_model_pulled

PULLED = {"gemma4:31b", "qwen2.5vl:7b", "nomic-embed-text:latest"}


def test_exact_tag_is_available():
    assert ollama_model_pulled("gemma4:31b", PULLED)


def test_other_tag_of_same_model_is_not_available():
    assert not ollama_model_pulled("gemma4:e4b", PULLED)


def test_similar_name_is_not_available():
    assert not ollama_model_pulled("qwen2.5:7b", PULLED)


def test_untagged_means_latest():
    assert ollama_model_pulled("nomic-embed-text", PULLED)
    assert not ollama_model_pulled("gemma4", PULLED)


def test_probe_reports_missing_model(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": n} for n in PULLED]})

    real_client = httpx.Client
    monkeypatch.setattr(
        llm.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)
    )
    res = llm.probe_provider("ollama", ollama_host="http://ollama:11434", ollama_model="gemma4:e4b")
    assert res["ok"] is True
    assert res["model_available"] is False
    assert "not pulled" in res["detail"]

    res = llm.probe_provider("ollama", ollama_host="http://ollama:11434", ollama_model="gemma4:31b")
    assert res["model_available"] is True
