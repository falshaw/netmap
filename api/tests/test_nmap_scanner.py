"""Tests for nmap scanner and device classification"""

import pytest
from app.scanner.nmap_scanner import classify_device, mac_vendor_lookup


class TestClassifyDevice:
    def test_printer_ports(self):
        assert classify_device([9100, 80]) == "printer"

    def test_printer_ipp(self):
        assert classify_device([631]) == "printer"

    def test_server_db(self):
        assert classify_device([22, 5432]) == "server"

    def test_server_web(self):
        assert classify_device([22, 80, 443]) == "server"

    def test_endpoint_windows(self):
        assert classify_device([135, 139, 445]) == "endpoint"

    def test_endpoint_rdp(self):
        assert classify_device([3389, 135]) == "endpoint"

    def test_switch_snmp_only(self):
        assert classify_device([161]) == "switch"

    def test_os_override_firewall(self):
        assert classify_device([443, 22], os_family="PAN-OS 10.2") == "firewall"

    def test_os_override_router(self):
        assert classify_device([22, 161], os_family="Cisco IOS 15.2") == "router"

    def test_unknown(self):
        assert classify_device([]) == "unknown"

    def test_server_redis(self):
        assert classify_device([6379]) == "server"


class TestMacVendorLookup:
    def test_cisco(self):
        assert mac_vendor_lookup("00:00:0C:AA:BB:CC") == "Cisco Systems"

    def test_palo_alto(self):
        assert mac_vendor_lookup("00:1B:17:AA:BB:CC") == "Palo Alto Networks"

    def test_fortinet(self):
        assert mac_vendor_lookup("00:09:0F:11:22:33") == "Fortinet"

    def test_vmware(self):
        assert mac_vendor_lookup("00:50:56:AA:BB:CC") == "VMware"

    def test_ubiquiti(self):
        assert mac_vendor_lookup("F0:9F:C2:AA:BB:CC") == "Ubiquiti"

    def test_unknown_mac(self):
        assert mac_vendor_lookup("AA:BB:CC:DD:EE:FF") is None

    def test_empty(self):
        assert mac_vendor_lookup("") is None

    def test_none(self):
        assert mac_vendor_lookup(None) is None

    def test_short_mac(self):
        assert mac_vendor_lookup("00:1B") is None

    def test_juniper(self):
        assert mac_vendor_lookup("00:05:85:AA:BB:CC") == "Juniper Networks"
