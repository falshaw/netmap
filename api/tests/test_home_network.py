"""Home/office LANs: phones, speakers and the router must be found and named right."""

import asyncio

from app.scanner import nmap_scanner, orchestrator
from app.scanner.models import DiscoveredDevice
from app.scanner.nmap_scanner import (
    DEFAULT_PORTS,
    DISCOVERY_PORTS,
    classify_device,
    parse_nmap_hosts,
    refine_by_hostname,
)
from app.scanner.orchestrator import infer_gateways


def _host(ports, name=""):
    return {
        "status": {"state": "up", "reason": "syn-ack"},
        "hostnames": [{"name": name, "type": "PTR" if name else ""}],
        "addresses": {},
        "vendor": {},
        "tcp": {p: {"state": "open"} for p in ports},
    }


class TestDefaultPorts:
    def test_probes_home_device_ports(self):
        ports = {int(p) for p in DEFAULT_PORTS.split(",")}
        assert {62078, 7000, 1400, 8008, 8009, 8090, 5000, 49152} <= ports

    def test_discovery_ports_are_probed_by_the_port_scan_too(self):
        assert set(DISCOVERY_PORTS) <= {int(p) for p in DEFAULT_PORTS.split(",")}


class FakeScanner:
    """python-nmap stand-in: one canned result per scan() call."""

    def __init__(self, results):
        self.results = list(results)
        self.calls = []
        self._last = {}

    def scan(self, hosts, arguments):
        self.calls.append((hosts, arguments))
        self._last = self.results.pop(0)

    def all_hosts(self):
        return list(self._last)

    def __getitem__(self, host):
        return self._last[host]


class TestBridgeModeScan:
    def test_only_discovered_hosts_are_port_scanned(self, monkeypatch):
        monkeypatch.setenv("SCAN_MODE", "limited")

        async def fake_discover(subnet):
            return {"10.0.0.7", "10.0.0.1"}

        fake = FakeScanner([{
            "10.0.0.1": _host([53, 80]),
            "10.0.0.7": {"status": {"state": "up", "reason": "user-set"}, "hostnames": [], "tcp": {}},
        }])
        monkeypatch.setattr(nmap_scanner, "tcp_discover", fake_discover)
        monkeypatch.setattr(nmap_scanner.nmap, "PortScanner", lambda: fake)
        devices = nmap_scanner._scan_sync("10.0.0.0/24", DEFAULT_PORTS, False)

        assert len(fake.calls) == 1
        hosts, args = fake.calls[0]
        assert hosts == "10.0.0.1 10.0.0.7"
        assert "-Pn" in args and "--max-parallelism" in args
        # 10.0.0.7 answered discovery, so it stays even though no port answered later
        assert sorted(d.ip_address for d in devices) == ["10.0.0.1", "10.0.0.7"]

    def test_no_live_host_skips_the_port_scan(self, monkeypatch):
        monkeypatch.setenv("SCAN_MODE", "limited")

        async def fake_discover(subnet):
            return set()

        fake = FakeScanner([])
        monkeypatch.setattr(nmap_scanner, "tcp_discover", fake_discover)
        monkeypatch.setattr(nmap_scanner.nmap, "PortScanner", lambda: fake)
        assert nmap_scanner._scan_sync("10.0.0.0/24", DEFAULT_PORTS, False) == []
        assert fake.calls == []

    def test_full_mode_scans_the_range_with_nmap_discovery(self, monkeypatch):
        monkeypatch.setenv("SCAN_MODE", "full")

        async def must_not_run(subnet):
            raise AssertionError("tcp_discover used in full mode")

        fake = FakeScanner([{"10.0.0.1": _host([22])}])
        monkeypatch.setattr(nmap_scanner, "tcp_discover", must_not_run)
        monkeypatch.setattr(nmap_scanner.nmap, "PortScanner", lambda: fake)
        nmap_scanner._scan_sync("10.0.0.0/24", DEFAULT_PORTS, True)
        hosts, args = fake.calls[0]
        assert hosts == "10.0.0.0/24" and "-Pn" not in args


class TestTcpDiscover:
    def test_listening_and_refusing_hosts_are_live(self):
        import socket

        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        open_port = listener.getsockname()[1]
        closed = socket.socket()
        closed.bind(("127.0.0.1", 0))
        closed_port = closed.getsockname()[1]
        closed.close()
        try:
            assert asyncio.run(nmap_scanner.tcp_discover("127.0.0.1/32", ports=(open_port,))) == {"127.0.0.1"}
            # A refused connect (RST) proves the host exists too. Windows reports
            # a refused loopback connect only after ~2 s of SYN retries.
            live = asyncio.run(nmap_scanner.tcp_discover("127.0.0.1/32", ports=(closed_port,), timeout=5))
            assert live == {"127.0.0.1"}
        finally:
            listener.close()

    def test_silent_address_is_not_live(self):
        # 192.0.2.0/24 is TEST-NET-1: nothing answers there.
        assert asyncio.run(nmap_scanner.tcp_discover("192.0.2.1/32", ports=(80,), timeout=0.3)) == set()

    def test_concurrency_is_capped(self, monkeypatch):
        open_now = peak = 0

        async def fake_open(ip, port):
            nonlocal open_now, peak
            open_now += 1
            peak = max(peak, open_now)
            try:
                await asyncio.sleep(0.01)
            finally:  # also when a sibling probe already answered and this one is cancelled
                open_now -= 1
            raise ConnectionRefusedError

        monkeypatch.setattr(nmap_scanner.asyncio, "open_connection", fake_open)
        live = asyncio.run(nmap_scanner.tcp_discover("10.9.0.0/26", ports=(1, 2, 3), concurrency=5))
        assert len(live) == 62
        assert peak <= 5


class TestClassifyHomeDevices:
    def test_iphone(self):
        assert classify_device([49152, 62078]) == "endpoint"

    def test_airplay_speaker(self):
        assert classify_device([7000]) == "media"

    def test_sonos(self):
        assert classify_device([1400, 7000]) == "media"

    def test_chromecast(self):
        assert classify_device([8008, 8009, 7000]) == "media"

    def test_nas(self):
        assert classify_device([5000]) == "server"

    def test_web_ui_only_is_not_a_server(self):
        assert classify_device([80]) == "unknown"
        assert classify_device([80, 8080]) == "unknown"

    def test_ssh_or_https_is_still_a_server(self):
        assert classify_device([22, 80]) == "server"
        assert classify_device([443]) == "server"

    def test_windows_pc(self):
        assert classify_device([135, 139, 445]) == "endpoint"


class TestHostnameHints:
    def test_speaker_names(self):
        assert refine_by_hostname("unknown", "Sonos-Demo") == "media"
        assert refine_by_hostname("unknown", "Bose-Smart-Speaker-500") == "media"
        assert refine_by_hostname("server", "SonosZP") == "media"

    def test_phone_names(self):
        assert refine_by_hostname("unknown", "iPhone") == "endpoint"

    def test_infrastructure_is_never_relabelled(self):
        assert refine_by_hostname("router", "bose-router") == "router"
        assert refine_by_hostname("printer", "speaker-printer") == "printer"

    def test_no_name_keeps_type(self):
        assert refine_by_hostname("unknown", None) == "unknown"

    def test_parse_uses_ports_and_name(self):
        hosts = {
            "192.168.1.20": _host([80, 8080], name="SoundTouch-Demo"),
            "192.168.1.21": _host([62078]),
        }
        devs = {d.ip_address: d for d in parse_nmap_hosts(hosts, "192.168.1.0/24")}
        assert devs["192.168.1.20"].device_type == "media"
        assert devs["192.168.1.20"].open_ports == [80, 8080]
        assert devs["192.168.1.21"].device_type == "endpoint"


class TestHomeRouter:
    def test_first_address_with_dns_is_the_router(self):
        devs = {
            "192.168.1.1": DiscoveredDevice(ip_address="192.168.1.1", device_type="server", open_ports=[53, 80, 8443]),
            "192.168.1.9": DiscoveredDevice(ip_address="192.168.1.9", device_type="unknown"),
        }
        assert infer_gateways(devs, ["192.168.1.0/24"], [], "172.18.0.1") == {"192.168.1.0/24": "192.168.1.1"}
        assert devs["192.168.1.1"].device_type == "router"

    def test_first_address_server_without_dns_stays_a_server(self):
        devs = {"10.1.0.1": DiscoveredDevice(ip_address="10.1.0.1", device_type="server", open_ports=[22, 443])}
        infer_gateways(devs, ["10.1.0.0/24"], [], None)
        assert devs["10.1.0.1"].device_type == "server"


class TestNamesFromGateway:
    def _devices(self):
        return {
            "192.168.1.1": DiscoveredDevice(ip_address="192.168.1.1", device_type="router", open_ports=[53, 80]),
            "192.168.1.20": DiscoveredDevice(ip_address="192.168.1.20", device_type="unknown", open_ports=[80]),
            "192.168.1.21": DiscoveredDevice(ip_address="192.168.1.21", hostname="kept", device_type="endpoint"),
        }

    def test_router_dns_names_nameless_hosts(self, monkeypatch):
        asked = {}

        def fake_reverse(ips, server):
            asked.update(ips=sorted(ips), server=server)
            return {"192.168.1.1": "home-router", "192.168.1.20": "Sonos-Demo"}

        monkeypatch.setattr(orchestrator, "reverse_dns", fake_reverse)
        devs = self._devices()
        asyncio.run(orchestrator._names_from_gateways(devs, {"192.168.1.0/24": "192.168.1.1"}))
        assert asked == {"ips": ["192.168.1.1", "192.168.1.20"], "server": "192.168.1.1"}
        assert devs["192.168.1.1"].hostname == "home-router"
        assert devs["192.168.1.1"].device_type == "router"
        assert devs["192.168.1.20"].hostname == "Sonos-Demo"
        assert devs["192.168.1.20"].device_type == "media"
        assert devs["192.168.1.21"].hostname == "kept"

    def test_gateway_without_dns_is_not_asked(self, monkeypatch):
        monkeypatch.setattr(orchestrator, "reverse_dns", lambda *a: (_ for _ in ()).throw(AssertionError("asked")))
        devs = self._devices()
        devs["192.168.1.1"].open_ports = [80]
        asyncio.run(orchestrator._names_from_gateways(devs, {"192.168.1.0/24": "192.168.1.1"}))
        assert devs["192.168.1.20"].hostname is None

    def test_reverse_dns_rejects_non_ip_input(self):
        import pytest

        with pytest.raises(ValueError):
            nmap_scanner.reverse_dns(["192.168.1.2"], "1.1.1.1; rm -rf /")
