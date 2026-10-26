"""Application settings routes"""

import os
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import llm
from app.database import get_db
from app.models import AppSettings
from app.schemas import (
    SettingsResponse,
    SettingsUpdate,
    LLMTestRequest,
    LLMTestResponse,
)
from app.crypto import encrypt_value, decrypt_value

router = APIRouter()

# Fields that contain sensitive credentials and must be encrypted at rest
_SENSITIVE_FIELDS = {
    "snmp_community",
    "snmp_v3_auth_password",
    "snmp_v3_priv_password",
    "notify_webhook_url",  # may embed a bot token (e.g. Telegram)
}


def _get_or_create(db: Session) -> AppSettings:
    """Get singleton settings row (id=1), create if missing."""
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _decrypt_settings(settings: AppSettings) -> dict:
    """Return settings dict with sensitive fields decrypted."""
    data = {
        "id": settings.id,
        "snmp_community": decrypt_value(settings.snmp_community) or "",
        "snmp_version": settings.snmp_version,
        "snmp_port": settings.snmp_port,
        "snmp_timeout": settings.snmp_timeout,
        "snmp_retries": settings.snmp_retries,
        "snmp_v3_user": settings.snmp_v3_user or "",
        "snmp_v3_auth_protocol": settings.snmp_v3_auth_protocol or "",
        "snmp_v3_auth_password_set": bool(settings.snmp_v3_auth_password),
        "snmp_v3_priv_protocol": settings.snmp_v3_priv_protocol or "",
        "snmp_v3_priv_password_set": bool(settings.snmp_v3_priv_password),
        "default_scan_nmap": settings.default_scan_nmap,
        "default_scan_arp": settings.default_scan_arp,
        "default_scan_snmp": settings.default_scan_snmp,
        "llm_provider": settings.llm_provider or "ollama",
        "llm_ollama_host": settings.llm_ollama_host or "",
        "llm_ollama_model": settings.llm_ollama_model or "",
        "llm_claude_model": settings.llm_claude_model or "sonnet",
        "notify_enabled": bool(settings.notify_enabled),
        "notify_webhook_url": decrypt_value(settings.notify_webhook_url) or "",
        "notify_on_scan_complete": bool(settings.notify_on_scan_complete),
        "notify_on_scan_failed": bool(settings.notify_on_scan_failed),
        "updated_at": settings.updated_at,
    }
    return data


@router.get("", response_model=SettingsResponse)
async def get_settings(db: Session = Depends(get_db)):
    """Get application settings."""
    settings = _get_or_create(db)
    return _decrypt_settings(settings)


@router.put("", response_model=SettingsResponse)
async def update_settings(
    update: SettingsUpdate,
    db: Session = Depends(get_db),
):
    """Update application settings."""
    settings = _get_or_create(db)
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in _SENSITIVE_FIELDS and value is not None:
            value = encrypt_value(value)
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return _decrypt_settings(settings)


@router.post("/llm/test", response_model=LLMTestResponse)
async def test_llm_connection(
    req: LLMTestRequest,
    db: Session = Depends(get_db),
):
    """Probe the configured LLM provider's health endpoint.

    Uses the override values in the request when supplied (so the Settings card
    can test what is on screen before saving), otherwise the persisted settings.
    Routes through ``app.llm.probe_provider`` — the previously-unwired client.
    """
    settings = _get_or_create(db)
    provider = req.llm_provider or settings.llm_provider or "ollama"

    # A field sent blank means "what .env says", as the form describes;
    # only a field left out falls back to the saved value.
    def on_screen(sent: Optional[str], saved: Optional[str]) -> Optional[str]:
        return (sent or None) if sent is not None else saved

    result = llm.probe_provider(
        provider,
        ollama_host=on_screen(req.llm_ollama_host, settings.llm_ollama_host),
        ollama_model=on_screen(req.llm_ollama_model, settings.llm_ollama_model),
        claude_model=req.llm_claude_model or settings.llm_claude_model,
        bridge_token=os.getenv("CLAUDE_BRIDGE_TOKEN"),
    )
    return result
