"""SNMPv3 credentials, saved timeout/retries and the scanner's own addresses."""

import asyncio
import os

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key")

import pytest  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from pysnmp.hlapi.v3arch.asyncio import CommunityData, UsmUserData  # noqa: E402

from app.models import AppSettings  # noqa: E402
from app.routes import scans  # noqa: E402
from app.routes.scans import apply_settings_defaults, snmp_options, v3_problem  # noqa: E402
from app.routes.settings import _decrypt_settings  # noqa: E402
from app.scanner import orchestrator, snmp  # noqa: E402
from app.scanner.orchestrator import has_snmp_credentials, local_ipv4_addresses  # noqa: E402
from app.schemas import ScanRequest, SettingsUpdate  # noqa: E402


class TestAuthData:
    def test_defaults_are_5s_and_2_retries(self):
        auth = snmp._get_auth_data("public", "2c")
        assert (auth.timeout, auth.retries) == (5, 2)
        assert isinstance(auth.data, CommunityData)

    def test_saved_values_are_used(self):
        auth = snmp._get_auth_data("public", "2c", timeout=12, retries=0)
        assert (auth.timeout, auth.retries) == (12, 0)

    def test_values_are_clamped(self):
        auth = snmp._get_auth_data("public", "2c", timeout=0, retries=99)
        assert (auth.timeout, auth.retries) == (1, 10)

    def test_v3_builds_usm_user(self):
        auth = snmp._get_auth_data(
            None, "3", v3_user="netops",
            v3_auth_protocol="sha256", v3_auth_password="auth-secret",
            v3_priv_protocol="aes", v3_priv_password="priv-secret",
        )
        assert isinstance(auth.data, UsmUserData)
        assert auth.data.userName == "netops"

    def test_v3_auth_protocol_without_password_is_refused(self):
        with pytest.raises(ValueError):
            snmp._get_auth_data(None, "3", v3_user="netops", v3_auth_protocol="sha")

    def test_transport_gets_the_saved_timing(self, monkeypatch):
        seen = {}

        async def fake_create(addr, timeout, retries):
            seen.update(timeout=timeout, retries=retries)
            raise RuntimeError("stop before any packet is sent")

        monkeypatch.setattr(snmp.UdpTransportTarget, "create", fake_create)
        auth = snmp._get_auth_data("public", "2c", timeout=9, retries=4)
        with pytest.raises(RuntimeError):
            asyncio.run(snmp._snmp_walk("192.0.2.1", 161, auth, "1.3.6.1.2.1.1"))
        assert seen == {"timeout": 9, "retries": 4}


class TestWalkRequests:
    """pysnmp 7: bulk_walk_cmd/walk_cmd are async generators; v1 has no GETBULK."""

    def _which(self, monkeypatch, version):
        used = []
        monkeypatch.setattr(snmp, "walk_cmd", lambda *a, **k: used.append("walk") or "w")
        monkeypatch.setattr(snmp, "bulk_walk_cmd", lambda *a, **k: used.append("bulk") or "b")
        kw = dict(v3_user="netops") if version == "3" else {}
        snmp._walk_requests(None, snmp._get_auth_data("public", version, **kw), None, "1.3.6.1.2.1.1")
        return used

    def test_v1_uses_getnext(self, monkeypatch):
        assert self._which(monkeypatch, "1") == ["walk"]

    def test_v2c_uses_getbulk(self, monkeypatch):
        assert self._which(monkeypatch, "2c") == ["bulk"]

    def test_v3_uses_getbulk(self, monkeypatch):
        assert self._which(monkeypatch, "3") == ["bulk"]

    def test_walk_stops_at_the_subtree_end(self, monkeypatch):
        async def fake_walk(*a, **k):
            yield None, None, None, [("1.3.6.1.2.1.2.2.1.1.1", "1"), ("1.3.6.1.2.1.2.2.1.1.2", "2")]
            yield None, None, None, [("1.3.6.1.2.1.2.2.1.10.1", "999")]  # ifInOctets, not ifIndex

        async def fake_create(*a, **k):
            return None

        monkeypatch.setattr(snmp, "_walk_requests", fake_walk)
        monkeypatch.setattr(snmp.UdpTransportTarget, "create", fake_create)
        auth = snmp._get_auth_data("public", "2c")
        rows = asyncio.run(snmp._snmp_walk("192.0.2.1", 161, auth, "1.3.6.1.2.1.2.2.1.1"))
        assert rows == [("1.3.6.1.2.1.2.2.1.1.1", "1"), ("1.3.6.1.2.1.2.2.1.1.2", "2")]


def _settings(**kw) -> AppSettings:
    base = dict(id=1, snmp_community=None, snmp_version="3", snmp_port=161,
                snmp_timeout=8, snmp_retries=1)
    base.update(kw)
    return AppSettings(**base)


class TestScanRequestV3:
    def test_unset_v3_fields_come_from_settings(self, monkeypatch):
        monkeypatch.setattr(scans, "decrypt_value", lambda v: f"plain:{v}" if v else v)
        req = ScanRequest(target_ip="10.0.0.1")
        apply_settings_defaults(req, _settings(
            snmp_v3_user="netops", snmp_v3_auth_protocol="sha",
            snmp_v3_auth_password="tok-a", snmp_v3_priv_protocol="aes",
            snmp_v3_priv_password="tok-p",
        ))
        assert req.snmp_version == "3"
        assert req.snmp_v3_user == "netops"
        assert req.snmp_v3_auth_password == "plain:tok-a"
        assert req.snmp_v3_priv_password == "plain:tok-p"

    def test_typed_v3_user_wins(self, monkeypatch):
        monkeypatch.setattr(scans, "decrypt_value", lambda v: v)
        req = ScanRequest(target_ip="10.0.0.1", snmp_v3_user="typed")
        apply_settings_defaults(req, _settings(snmp_v3_user="saved"))
        assert req.snmp_v3_user == "typed"

    def test_options_carry_saved_timing(self):
        req = ScanRequest(target_ip="10.0.0.1", snmp_v3_user="netops")
        opts = snmp_options(req, _settings())
        assert opts["timeout"] == 8 and opts["retries"] == 1
        assert opts["v3_user"] == "netops"

    def test_no_settings_row_means_scanner_defaults(self):
        opts = snmp_options(ScanRequest(target_ip="10.0.0.1"), None)
        assert opts["timeout"] is None and opts["retries"] is None

    def test_unknown_protocol_is_rejected(self):
        with pytest.raises(ValidationError):
            ScanRequest(target_ip="10.0.0.1", snmp_v3_auth_protocol="sha999")

    def test_protocol_is_lowercased(self):
        assert ScanRequest(target_ip="10.0.0.1", snmp_v3_priv_protocol="AES256").snmp_v3_priv_protocol == "aes256"


class TestV3Problem:
    def _opts(self, **kw):
        base = dict(v3_user="netops", v3_auth_protocol=None, v3_auth_password=None,
                    v3_priv_protocol=None, v3_priv_password=None)
        base.update(kw)
        return base

    def test_no_auth_no_priv_is_fine(self):
        assert v3_problem(self._opts()) is None

    def test_auth_priv_is_fine(self):
        assert v3_problem(self._opts(
            v3_auth_protocol="sha", v3_auth_password="12345678",
            v3_priv_protocol="aes", v3_priv_password="abcdefgh",
        )) is None

    def test_missing_user(self):
        assert "user name" in v3_problem(self._opts(v3_user=None))

    def test_auth_without_password(self):
        assert "auth password" in v3_problem(self._opts(v3_auth_protocol="sha"))

    def test_priv_without_auth(self):
        assert "needs an auth protocol" in v3_problem(
            self._opts(v3_priv_protocol="aes", v3_priv_password="abcdefgh"))

    def test_short_password(self):
        assert "8 characters" in v3_problem(
            self._opts(v3_auth_protocol="sha", v3_auth_password="short"))


class TestSettingsV3:
    def test_passwords_are_never_returned(self):
        row = _settings(snmp_v3_user="netops", snmp_v3_auth_protocol="sha",
                        snmp_v3_auth_password="encrypted-token",
                        snmp_v3_priv_password=None,
                        default_scan_nmap=True, default_scan_arp=True, default_scan_snmp=True)
        data = _decrypt_settings(row)
        assert "snmp_v3_auth_password" not in data
        assert "snmp_v3_priv_password" not in data
        assert data["snmp_v3_auth_password_set"] is True
        assert data["snmp_v3_priv_password_set"] is False
        assert data["snmp_v3_user"] == "netops"

    def test_timeout_and_retries_are_bounded(self):
        with pytest.raises(ValidationError):
            SettingsUpdate(snmp_timeout=0)
        with pytest.raises(ValidationError):
            SettingsUpdate(snmp_retries=11)


class TestOrchestratorHelpers:
    def test_v3_needs_a_user_not_a_community(self):
        assert has_snmp_credentials("3", None, "netops")
        assert not has_snmp_credentials("3", "public", None)
        assert has_snmp_credentials("2c", "public", None)
        assert not has_snmp_credentials("2c", None, "netops")

    def test_local_addresses_from_fib_trie(self, tmp_path):
        trie = tmp_path / "fib_trie"
        trie.write_text(
            "Main:\n"
            "  +-- 0.0.0.0/0 3 0 5\n"
            "     |-- 0.0.0.0\n"
            "        /0 universe UNICAST\n"
            "     +-- 127.0.0.0/8 2 0 2\n"
            "        |-- 127.0.0.1\n"
            "           /32 host LOCAL\n"
            "     |-- 172.18.0.0\n"
            "        /16 link UNICAST\n"
            "     |-- 172.18.0.3\n"
            "        /32 host LOCAL\n"
            "Local:\n"
            "     |-- 172.18.0.3\n"
            "        /32 host LOCAL\n",
            encoding="ascii",
        )
        assert local_ipv4_addresses(str(trie)) == {"172.18.0.3"}

    def test_missing_fib_trie_is_empty(self, tmp_path):
        assert local_ipv4_addresses(str(tmp_path / "nope")) == set()


def test_scan_leaves_out_the_scanners_own_address(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.database import Base
    from app.models import Device, Scan
    from app.scanner.models import ArpEntry, DiscoveredDevice

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    scan = Scan(target_ip="172.18.0.1", subnets=["172.18.0.0/28"], status="pending")
    db.add(scan)
    db.commit()

    async def fake_scan_subnet(subnet):
        return [DiscoveredDevice(ip_address=ip) for ip in ("172.18.0.1", "172.18.0.2", "172.18.0.3")]

    async def fake_arp_scan(subnet):
        return [ArpEntry(ip_address="172.18.0.3", mac_address="02:42:ac:12:00:03")]

    monkeypatch.setattr(orchestrator, "scan_subnet", fake_scan_subnet)
    monkeypatch.setattr(orchestrator, "arp_scan", fake_arp_scan)
    monkeypatch.setattr(orchestrator, "_local_default_gateway", lambda: None)
    monkeypatch.setattr(orchestrator, "local_ipv4_addresses", lambda: {"172.18.0.3"})

    asyncio.run(orchestrator.run_scan(db, scan.id, "172.18.0.1", ["172.18.0.0/28"], scan_snmp=False))
    db.refresh(scan)
    assert scan.status == "completed", scan.error_message
    ips = sorted(d.ip_address for d in db.query(Device).filter(Device.scan_id == scan.id))
    assert ips == ["172.18.0.1", "172.18.0.2"]


def test_subnet_positions_are_saved():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.database import Base
    from app.models import Network, Scan
    from app.routes.topology import update_positions
    from app.schemas import PositionUpdateRequest

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    scan = Scan(target_ip="10.0.0.1", status="completed")
    db.add(scan)
    db.commit()
    net = Network(scan_id=scan.id, network_address="10.0.0.0", prefix_length=24)
    other = Scan(target_ip="10.0.0.1", status="completed")
    db.add_all([net, other])
    db.commit()
    foreign = Network(scan_id=other.id, network_address="10.9.0.0", prefix_length=24)
    db.add(foreign)
    db.commit()

    req = PositionUpdateRequest(networks=[
        {"network_id": net.id, "x": 120.5, "y": -40},
        {"network_id": foreign.id, "x": 1, "y": 1},  # other scan: ignored
    ])
    asyncio.run(update_positions(scan.id, req, db))
    db.refresh(net)
    db.refresh(foreign)
    assert (net.position_x, net.position_y) == (120.5, -40)
    assert foreign.position_x is None
