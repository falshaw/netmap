"""Discovery must only turn live, responding hosts into devices."""

import asyncio

from app.scanner import orchestrator
from app.scanner.models import ArpEntry, DiscoveredDevice, DiscoveredRoute
from app.scanner.nmap_scanner import _nmap_arguments, is_host_address, parse_nmap_hosts
from app.scanner.orchestrator import _auto_layout, _local_default_gateway, infer_gateways
from app.scanner.topology import build_topology

PORTS = "22,80,443"


def _host(state="up", reason="syn-ack", ports=None):
    return {
        "status": {"state": state, "reason": reason},
        "hostnames": [{"name": "", "type": ""}],
        "addresses": {},
        "vendor": {},
        "tcp": {p: {"state": st} for p, st in (ports or {}).items()},
    }


def _topology(devs, target, subnets):
    return build_topology(
        devices=devs, interfaces={}, arp_entries=[], cdp_neighbors=[], lldp_neighbors=[],
        routes=[], vlans=[], target_ip=target, subnets=subnets,
    )


class TestIsHostAddress:
    def test_network_address_is_not_a_host(self):
        assert not is_host_address("172.30.5.0", "172.30.5.0/28")

    def test_broadcast_address_is_not_a_host(self):
        assert not is_host_address("172.30.5.15", "172.30.5.0/28")

    def test_usable_address(self):
        assert is_host_address("172.30.5.1", "172.30.5.0/28")

    def test_outside_subnet(self):
        assert not is_host_address("172.30.6.1", "172.30.5.0/28")

    def test_point_to_point_31(self):
        assert is_host_address("10.0.0.0", "10.0.0.0/31")
        assert is_host_address("10.0.0.1", "10.0.0.0/31")

    def test_garbage(self):
        assert not is_host_address("not-an-ip", "10.0.0.0/24")


class TestNmapArguments:
    def test_limited_mode_port_scan_is_unprivileged(self):
        # -Pn is safe here: the port scan only gets hosts a discovery pass proved live.
        args = _nmap_arguments(PORTS, True, "limited").split()
        assert "--unprivileged" in args and "-sT" in args
        assert "-O" not in args

    def test_full_mode_keeps_host_discovery(self):
        args = _nmap_arguments(PORTS, True, "full").split()
        assert "-Pn" not in args
        assert "-sS" in args and "-O" in args


class TestParseNmapHosts:
    def test_only_live_hosts_of_a_slash_28(self):
        """Regression: a /28 with 3 live hosts produced 16 devices."""
        subnet = "172.30.5.0/28"
        # nmap with -Pn reported every address "up" (reason user-set)
        hosts = {f"172.30.5.{i}": _host(reason="user-set", ports={22: "filtered"}) for i in range(16)}
        hosts["172.30.5.1"] = _host(reason="conn-refused", ports={22: "closed"})
        hosts["172.30.5.2"] = _host(ports={80: "open"})
        hosts["172.30.5.3"] = _host(ports={5432: "open"})
        devices = parse_nmap_hosts(hosts, subnet)
        assert sorted(d.ip_address for d in devices) == ["172.30.5.1", "172.30.5.2", "172.30.5.3"]

    def test_down_hosts_are_skipped(self):
        hosts = {"10.0.0.5": _host(state="down", reason="no-response")}
        assert parse_nmap_hosts(hosts, "10.0.0.0/24") == []

    def test_network_and_broadcast_never_devices(self):
        hosts = {
            "10.0.0.0": _host(ports={80: "open"}),
            "10.0.0.255": _host(ports={80: "open"}),
            "10.0.0.7": _host(ports={80: "open"}),
        }
        assert [d.ip_address for d in parse_nmap_hosts(hosts, "10.0.0.0/24")] == ["10.0.0.7"]

    def test_classification(self):
        hosts = {
            "10.0.0.2": _host(ports={5432: "open"}),
            "10.0.0.3": _host(reason="conn-refused", ports={22: "closed"}),
        }
        types = {d.ip_address: d.device_type for d in parse_nmap_hosts(hosts, "10.0.0.0/24")}
        assert types == {"10.0.0.2": "server", "10.0.0.3": "endpoint"}


class TestInferGateways:
    @staticmethod
    def _devices(*ips):
        return {ip: DiscoveredDevice(ip_address=ip, device_type="endpoint") for ip in ips}

    def test_local_default_gateway_wins(self):
        devs = self._devices("10.1.0.1", "10.1.0.254", "10.1.0.9")
        assert infer_gateways(devs, ["10.1.0.0/24"], [], "10.1.0.254") == {"10.1.0.0/24": "10.1.0.254"}
        assert devs["10.1.0.254"].device_type == "router"
        assert devs["10.1.0.1"].device_type == "endpoint"

    def test_snmp_default_route(self):
        devs = self._devices("10.1.0.9", "10.1.0.200")
        routes = [DiscoveredRoute(destination="0.0.0.0", prefix_length=0, next_hop="10.1.0.200")]
        assert infer_gateways(devs, ["10.1.0.0/24"], routes, None) == {"10.1.0.0/24": "10.1.0.200"}

    def test_first_address_convention(self):
        devs = self._devices("10.1.0.1", "10.1.0.9")
        assert infer_gateways(devs, ["10.1.0.0/24"], [], None) == {"10.1.0.0/24": "10.1.0.1"}
        assert devs["10.1.0.1"].device_type == "router"

    def test_convention_does_not_relabel_servers(self):
        devs = {"10.1.0.1": DiscoveredDevice(ip_address="10.1.0.1", device_type="server")}
        infer_gateways(devs, ["10.1.0.0/24"], [], None)
        assert devs["10.1.0.1"].device_type == "server"

    def test_dead_gateway_is_not_invented(self):
        devs = self._devices("10.1.0.9")
        assert infer_gateways(devs, ["10.1.0.0/24"], [], "10.1.0.1") == {}
        assert "10.1.0.1" not in devs

    def test_reads_proc_net_route(self, tmp_path):
        route = tmp_path / "route"
        route.write_text(
            "Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\n"
            "eth0\t00000000\t01051EAC\t0003\t0\t0\t0\t00000000\n"
            "eth0\t00051EAC\t00000000\t0001\t0\t0\t0\tF0FFFFFF\n"
        )
        assert _local_default_gateway(str(route)) == "172.30.5.1"

    def test_missing_route_file(self, tmp_path):
        assert _local_default_gateway(str(tmp_path / "nope")) is None


class TestSubnetIsANetworkNotADevice:
    def test_scanned_subnet_becomes_network(self):
        devs = {
            "172.30.5.1": DiscoveredDevice(ip_address="172.30.5.1", device_type="router"),
            "172.30.5.2": DiscoveredDevice(ip_address="172.30.5.2", device_type="server"),
            "172.30.5.3": DiscoveredDevice(ip_address="172.30.5.3", device_type="server"),
        }
        links, networks = _topology(devs, "172.30.5.1", ["172.30.5.0/28"])
        assert len(devs) == 3
        assert [(n.network_address, n.prefix_length) for n in networks] == [("172.30.5.0", 28)]
        assert networks[0].gateway_ip == "172.30.5.1"
        assert networks[0].device_count == 3
        assert {(lk.source_ip, lk.target_ip) for lk in links} == {
            ("172.30.5.1", "172.30.5.2"), ("172.30.5.1", "172.30.5.3"),
        }

    def test_single_host_subnet_still_a_network(self):
        devs = {"10.8.0.5": DiscoveredDevice(ip_address="10.8.0.5", device_type="server")}
        _, networks = _topology(devs, "10.8.0.250", ["10.8.0.0/24"])
        assert len(networks) == 1

    def test_plain_host_hub_is_not_reported_as_gateway(self):
        devs = {
            "10.9.0.5": DiscoveredDevice(ip_address="10.9.0.5", device_type="server"),
            "10.9.0.6": DiscoveredDevice(ip_address="10.9.0.6", device_type="server"),
        }
        _, networks = _topology(devs, "10.9.0.250", ["10.9.0.0/24"])
        assert networks[0].gateway_ip is None


class TestLayout:
    def test_gateway_on_top_hosts_below_not_one_line(self):
        devs = {f"10.0.0.{i}": DiscoveredDevice(ip_address=f"10.0.0.{i}") for i in range(1, 14)}
        devs["10.0.0.1"].device_type = "router"
        _, networks = _topology(devs, "10.0.0.1", ["10.0.0.0/24"])
        pos = _auto_layout(devs, networks)
        assert set(pos) == set(devs)
        gw_y = pos["10.0.0.1"][1]
        host_ys = {pos[ip][1] for ip in devs if ip != "10.0.0.1"}
        assert all(y > gw_y for y in host_ys)
        assert len(host_ys) >= 3  # 12 hosts wrap into rows of at most 5
        xs = [p[0] for p in pos.values()]
        assert max(xs) - min(xs) < 5 * 260  # not one long horizontal line

    def test_no_overlapping_nodes(self):
        devs = {
            f"10.0.{n}.{i}": DiscoveredDevice(ip_address=f"10.0.{n}.{i}")
            for n in (0, 1) for i in range(1, 8)
        }
        _, networks = _topology(devs, "10.0.0.1", ["10.0.0.0/24", "10.0.1.0/24"])
        pos = _auto_layout(devs, networks)
        assert len(set(pos.values())) == len(devs)


class TestRunScanEndToEnd:
    """run_scan with a fake nmap result: device count == live hosts."""

    def test_scan_persists_only_live_hosts(self, monkeypatch):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        from app.models import Device, Network, Scan

        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        db = sessionmaker(bind=engine)()
        scan = Scan(target_ip="172.30.5.1", subnets=["172.30.5.0/28"], status="pending")
        db.add(scan)
        db.commit()

        hosts = {f"172.30.5.{i}": _host(reason="user-set") for i in range(16)}
        hosts.update({
            "172.30.5.1": _host(reason="conn-refused", ports={22: "closed"}),
            "172.30.5.2": _host(ports={80: "open"}),
            "172.30.5.3": _host(ports={5432: "open"}),
            "172.30.5.4": _host(reason="conn-refused", ports={443: "closed"}),
        })

        async def fake_scan_subnet(subnet):
            return parse_nmap_hosts(hosts, subnet)

        async def fake_arp_scan(subnet):
            # a broadcast-address "reply" must never become a device
            return [ArpEntry(ip_address="172.30.5.15", mac_address="02:00:00:00:00:0f")]

        monkeypatch.setattr(orchestrator, "scan_subnet", fake_scan_subnet)
        monkeypatch.setattr(orchestrator, "arp_scan", fake_arp_scan)
        monkeypatch.setattr(orchestrator, "_local_default_gateway", lambda: "172.30.5.1")

        asyncio.run(orchestrator.run_scan(
            db, scan.id, "172.30.5.1", ["172.30.5.0/28"], scan_snmp=False,
        ))
        db.refresh(scan)
        assert scan.status == "completed", scan.error_message
        ips = sorted(d.ip_address for d in db.query(Device).filter(Device.scan_id == scan.id))
        assert ips == ["172.30.5.1", "172.30.5.2", "172.30.5.3", "172.30.5.4"]
        assert scan.device_count == 4
        gw = db.query(Device).filter(Device.ip_address == "172.30.5.1").one()
        assert gw.device_type == "router"
        nets = db.query(Network).filter(Network.scan_id == scan.id).all()
        assert [(n.network_address, n.prefix_length) for n in nets] == [("172.30.5.0", 28)]
