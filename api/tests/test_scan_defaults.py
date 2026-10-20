"""Scan requests take unset SNMP fields from Settings, never override set ones."""

from app.models import AppSettings
from app.routes import scans
from app.routes.scans import apply_settings_defaults
from app.schemas import ScanRequest


def _settings(**kw) -> AppSettings:
    base = dict(id=1, snmp_community=None, snmp_version="1", snmp_port=1161)
    base.update(kw)
    return AppSettings(**base)


def test_explicit_v2c_is_not_overridden_by_saved_default():
    req = ScanRequest(target_ip="10.0.0.1", snmp_version="2c", snmp_port=161)
    apply_settings_defaults(req, _settings())
    assert req.snmp_version == "2c"
    assert req.snmp_port == 161


def test_unset_version_and_port_come_from_settings():
    req = ScanRequest(target_ip="10.0.0.1")
    apply_settings_defaults(req, _settings())
    assert req.snmp_version == "1"
    assert req.snmp_port == 1161


def test_no_settings_row_falls_back_to_2c_and_161():
    req = ScanRequest(target_ip="10.0.0.1")
    apply_settings_defaults(req, None)
    assert req.snmp_version == "2c"
    assert req.snmp_port == 161
    assert req.snmp_community is None


def test_unset_community_is_decrypted_from_settings(monkeypatch):
    monkeypatch.setattr(scans, "decrypt_value", lambda v: f"plain:{v}")
    req = ScanRequest(target_ip="10.0.0.1")
    apply_settings_defaults(req, _settings(snmp_community="token"))
    assert req.snmp_community == "plain:token"


def test_explicit_community_wins(monkeypatch):
    monkeypatch.setattr(scans, "decrypt_value", lambda v: "from-settings")
    req = ScanRequest(target_ip="10.0.0.1", snmp_community="typed")
    apply_settings_defaults(req, _settings(snmp_community="token"))
    assert req.snmp_community == "typed"
