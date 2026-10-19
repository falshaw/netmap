"""Tests for topology builder"""

import pytest
from app.scanner.topology import build_topology, _group_by_subnet
from app.scanner.models import (
    DiscoveredDevice,
    DiscoveredInterface,
    DiscoveredNeighbor,
    DiscoveredRoute,
    DiscoveredVlan,
    ArpEntry,
)


def _make_device(ip: str, dtype: str = "unknown", hostname: str = None) -> DiscoveredDevice:
    return DiscoveredDevice(ip_address=ip, device_type=dtype, hostname=hostname)


def _make_interface(idx: int, ip: str = None, mask: str = None, speed: int = 1000) -> DiscoveredInterface:
    return DiscoveredInterface(
        if_index=idx,
        name=f"eth{idx}",
        ip_address=ip,
        subnet_mask=mask,
        speed_mbps=speed,
    )


class TestBuildTopology:
    def test_cdp_neighbor_link(self):
        devices = {
            "10.0.0.1": _make_device("10.0.0.1", "firewall", "fw1"),
            "10.0.0.2": _make_device("10.0.0.2", "switch", "sw1"),
        }
        cdp = [DiscoveredNeighbor(
            local_interface="1",
            remote_device_id="sw1",
            remote_hostname="sw1",
            remote_ip="10.0.0.2",
            remote_interface="Gi0/1",
            protocol="cdp",
        )]
        links, networks = build_topology(
            devices=devices, interfaces={}, arp_entries=[], cdp_neighbors=cdp,
            lldp_neighbors=[], routes=[], vlans=[], target_ip="10.0.0.1",
        )
        assert len(links) == 1
        assert links[0].source_ip == "10.0.0.1"
        assert links[0].target_ip == "10.0.0.2"
        assert links[0].discovery_method == "cdp"

    def test_lldp_neighbor_by_hostname(self):
        devices = {
            "10.0.0.1": _make_device("10.0.0.1", "switch"),
            "10.0.0.3": _make_device("10.0.0.3", "switch", hostname="sw2"),
        }
        lldp = [DiscoveredNeighbor(
            local_interface="2",
            remote_device_id="sw2",
            remote_hostname="sw2",
            remote_interface="Gi0/2",
            protocol="lldp",
        )]
        links, _ = build_topology(
            devices=devices, interfaces={}, arp_entries=[], cdp_neighbors=[],
            lldp_neighbors=lldp, routes=[], vlans=[], target_ip="10.0.0.1",
        )
        assert len(links) == 1
        assert links[0].discovery_method == "lldp"

    def test_arp_link(self):
        devices = {
            "10.0.0.1": _make_device("10.0.0.1", "firewall"),
            "10.0.0.5": _make_device("10.0.0.5", "server"),
        }
        arp = [ArpEntry(ip_address="10.0.0.5", mac_address="00:11:22:33:44:55")]
        links, _ = build_topology(
            devices=devices, interfaces={}, arp_entries=arp, cdp_neighbors=[],
            lldp_neighbors=[], routes=[], vlans=[], target_ip="10.0.0.1",
        )
        assert len(links) == 1
        assert links[0].discovery_method == "arp"

    def test_routing_link(self):
        devices = {
            "10.0.0.1": _make_device("10.0.0.1", "router"),
            "10.0.0.254": _make_device("10.0.0.254", "router"),
        }
        routes = [DiscoveredRoute(
            destination="192.168.0.0", prefix_length=24,
            next_hop="10.0.0.254", protocol="ospf",
        )]
        links, _ = build_topology(
            devices=devices, interfaces={}, arp_entries=[], cdp_neighbors=[],
            lldp_neighbors=[], routes=routes, vlans=[], target_ip="10.0.0.1",
        )
        assert len(links) == 1
        assert links[0].discovery_method == "routing"

    def test_no_self_link(self):
        devices = {"10.0.0.1": _make_device("10.0.0.1")}
        arp = [ArpEntry(ip_address="10.0.0.1", mac_address="00:11:22:33:44:55")]
        links, _ = build_topology(
            devices=devices, interfaces={}, arp_entries=arp, cdp_neighbors=[],
            lldp_neighbors=[], routes=[], vlans=[], target_ip="10.0.0.1",
        )
        assert len(links) == 0

    def test_no_duplicate_links(self):
        devices = {
            "10.0.0.1": _make_device("10.0.0.1", "firewall"),
            "10.0.0.2": _make_device("10.0.0.2", "switch"),
        }
        cdp = [DiscoveredNeighbor(
            local_interface="1", remote_device_id="sw1",
            remote_ip="10.0.0.2", remote_interface="Gi0/1", protocol="cdp",
        )]
        arp = [ArpEntry(ip_address="10.0.0.2", mac_address="AA:BB:CC:DD:EE:FF")]
        links, _ = build_topology(
            devices=devices, interfaces={}, arp_entries=arp, cdp_neighbors=cdp,
            lldp_neighbors=[], routes=[], vlans=[], target_ip="10.0.0.1",
        )
        # CDP + ARP both find same link — should be deduplicated
        assert len(links) == 1

    def test_subnet_inference(self):
        devices = {
            "192.168.1.1": _make_device("192.168.1.1", "router"),
            "192.168.1.10": _make_device("192.168.1.10", "server"),
            "192.168.1.20": _make_device("192.168.1.20", "endpoint"),
        }
        ifaces = {
            "192.168.1.1": [_make_interface(1, "192.168.1.1", "255.255.255.0")],
        }
        links, networks = build_topology(
            devices=devices, interfaces=ifaces, arp_entries=[], cdp_neighbors=[],
            lldp_neighbors=[], routes=[], vlans=[], target_ip="192.168.1.1",
        )
        # Router connects to both server and endpoint via subnet inference
        assert len(links) >= 2
        assert len(networks) >= 1
        assert networks[0].network_address == "192.168.1.0"
        assert networks[0].gateway_ip == "192.168.1.1"


class TestGroupBySubnet:
    def test_same_subnet(self):
        devices = {
            "10.0.0.1": _make_device("10.0.0.1"),
            "10.0.0.2": _make_device("10.0.0.2"),
        }
        ifaces = {
            "10.0.0.1": [_make_interface(1, "10.0.0.1", "255.255.255.0")],
        }
        groups = _group_by_subnet(devices, ifaces)
        assert "10.0.0.0/24" in groups
        assert "10.0.0.1" in groups["10.0.0.0/24"]

    def test_different_subnets(self):
        devices = {
            "10.0.0.1": _make_device("10.0.0.1"),
            "10.0.1.1": _make_device("10.0.1.1"),
        }
        ifaces = {
            "10.0.0.1": [_make_interface(1, "10.0.0.1", "255.255.255.0")],
            "10.0.1.1": [_make_interface(1, "10.0.1.1", "255.255.255.0")],
        }
        groups = _group_by_subnet(devices, ifaces)
        assert "10.0.0.0/24" in groups
        assert "10.0.1.0/24" in groups
