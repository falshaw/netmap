"""Tests for draw.io XML exporter"""

import pytest
import xml.etree.ElementTree as ET
from unittest.mock import MagicMock

from app.exporters.drawio import generate_drawio, _get_stroke_width, _format_speed


def _mock_device(id: int, ip: str, dtype: str = "unknown", hostname: str = None,
                  pos_x: float = 100, pos_y: float = 100) -> MagicMock:
    dev = MagicMock()
    dev.id = id
    dev.ip_address = ip
    dev.hostname = hostname
    dev.device_type = dtype
    dev.sys_name = hostname
    dev.sys_descr = None
    dev.vendor = None
    dev.position_x = pos_x
    dev.position_y = pos_y
    return dev


def _mock_link(id: int, src_id: int, tgt_id: int, method: str = "arp",
               bandwidth: int = 1000) -> MagicMock:
    link = MagicMock()
    link.id = id
    link.source_device_id = src_id
    link.target_device_id = tgt_id
    link.source_interface_id = None
    link.target_interface_id = None
    link.discovery_method = method
    link.bandwidth_mbps = bandwidth
    link.link_type = "ethernet"
    return link


def _mock_interface(id: int, name: str = "eth0", ip: str = None,
                     speed: int = 1000, vlan: int = None,
                     util_in: float = None, util_out: float = None) -> MagicMock:
    iface = MagicMock()
    iface.id = id
    iface.name = name
    iface.ip_address = ip
    iface.speed_mbps = speed
    iface.vlan_id = vlan
    iface.utilization_in = util_in
    iface.utilization_out = util_out
    return iface


class TestGenerateDrawio:
    def test_generates_valid_xml(self):
        devices = [_mock_device(1, "10.0.0.1", "firewall", "fw1")]
        xml = generate_drawio(devices, [], {})
        root = ET.fromstring(xml)
        assert root.tag == "mxfile"

    def test_device_nodes_created(self):
        devices = [
            _mock_device(1, "10.0.0.1", "firewall", "fw1"),
            _mock_device(2, "10.0.0.2", "switch", "sw1"),
        ]
        xml = generate_drawio(devices, [], {})
        root = ET.fromstring(xml)
        cells = root.findall(".//mxCell[@vertex='1']")
        assert len(cells) == 2

    def test_firewall_uses_cisco_shape(self):
        devices = [_mock_device(1, "10.0.0.1", "firewall", "fw1")]
        xml = generate_drawio(devices, [], {})
        root = ET.fromstring(xml)
        cell = root.find(".//mxCell[@id='device-1']")
        assert "firewall" in cell.get("style", "")

    def test_link_edges_created(self):
        devices = [
            _mock_device(1, "10.0.0.1", "firewall"),
            _mock_device(2, "10.0.0.2", "switch"),
        ]
        links = [_mock_link(1, 1, 2)]
        xml = generate_drawio(devices, links, {})
        root = ET.fromstring(xml)
        edges = root.findall(".//mxCell[@edge='1']")
        assert len(edges) == 1

    def test_link_stroke_width_by_bandwidth(self):
        devices = [
            _mock_device(1, "10.0.0.1", "firewall"),
            _mock_device(2, "10.0.0.2", "switch"),
        ]
        links = [_mock_link(1, 1, 2, bandwidth=10000)]
        xml = generate_drawio(devices, links, {})
        root = ET.fromstring(xml)
        edge = root.find(".//mxCell[@edge='1']")
        assert "strokeWidth=3" in edge.get("style", "")

    def test_empty_topology(self):
        xml = generate_drawio([], [], {})
        root = ET.fromstring(xml)
        assert root.tag == "mxfile"

    def test_device_label_includes_ip(self):
        devices = [_mock_device(1, "10.0.0.1", "server", "web-server")]
        xml = generate_drawio(devices, [], {})
        root = ET.fromstring(xml)
        cell = root.find(".//mxCell[@id='device-1']")
        value = cell.get("value", "")
        assert "10.0.0.1" in value
        assert "web-server" in value


class TestGetStrokeWidth:
    def test_100m(self):
        assert _get_stroke_width(100) == 1

    def test_1g(self):
        assert _get_stroke_width(1000) == 2

    def test_10g(self):
        assert _get_stroke_width(10000) == 3

    def test_40g(self):
        assert _get_stroke_width(40000) == 5

    def test_100g(self):
        assert _get_stroke_width(100000) == 6

    def test_zero(self):
        assert _get_stroke_width(0) == 1

    def test_none_bandwidth(self):
        assert _get_stroke_width(None) == 1


class TestFormatSpeed:
    def test_1g(self):
        assert _format_speed(1000) == "1G"

    def test_10g(self):
        assert _format_speed(10000) == "10G"

    def test_100m(self):
        assert _format_speed(100) == "100M"

    def test_zero(self):
        assert _format_speed(0) == ""
