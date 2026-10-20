"""The UI login must check the key the user typed, not just the injected one."""

import os

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key")
os.environ["API_KEY"] = "right-key"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)
INJECTED = {"X-API-Key": "right-key"}  # what nginx adds to every request


def test_correct_login_key():
    r = client.get("/api/auth/validate", headers={**INJECTED, "X-Login-Key": "right-key"})
    assert r.status_code == 200


def test_wrong_login_key_rejected_even_with_injected_key():
    r = client.get("/api/auth/validate", headers={**INJECTED, "X-Login-Key": "guess"})
    assert r.status_code == 403


def test_empty_login_key_rejected():
    r = client.get("/api/auth/validate", headers={**INJECTED, "X-Login-Key": ""})
    assert r.status_code == 403


def test_direct_api_caller_without_login_header():
    assert client.get("/api/auth/validate", headers=INJECTED).status_code == 200


def test_missing_api_key():
    assert client.get("/api/auth/validate").status_code == 401
