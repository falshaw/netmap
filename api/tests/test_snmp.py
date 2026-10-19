"""Tests for SNMP scanner module"""

import pytest
from app.scanner.snmp import _classify_by_sysdescr, _mask_to_prefix


class TestClassifyBySysDescr:
    def test_palo_alto(self):
        assert _classify_by_sysdescr("Palo Alto Networks PA-3260") == "firewall"

    def test_fortinet(self):
        assert _classify_by_sysdescr("FortiGate-60F v7.0.5,build0304") == "firewall"

    def test_cisco_asa(self):
        assert _classify_by_sysdescr("Cisco Adaptive Security Appliance ASA 5525-X") == "firewall"

    def test_cisco_catalyst(self):
        assert _classify_by_sysdescr("Cisco IOS Software, Catalyst 3850") == "switch"

    def test_cisco_ios_router(self):
        assert _classify_by_sysdescr("Cisco IOS Software, ISR4451") == "router"

    def test_juniper_srx(self):
        assert _classify_by_sysdescr("Juniper Networks SRX340") == "firewall"

    def test_linux_server(self):
        assert _classify_by_sysdescr("Linux ubuntu 5.4.0-42-generic") == "server"

    def test_windows_server(self):
        assert _classify_by_sysdescr("Hardware: Intel64 - Windows Server 2019") == "server"

    def test_hp_printer(self):
        assert _classify_by_sysdescr("HP ETHERNET MULTI-ENVIRONMENT,ROM none,JETDIRECT") == "printer"

    def test_unknown(self):
        assert _classify_by_sysdescr("Some random embedded device") == "unknown"

    def test_empty(self):
        assert _classify_by_sysdescr("") == "unknown"

    def test_arista_switch(self):
        assert _classify_by_sysdescr("Arista Networks EOS version 4.28.3M") == "switch"

    def test_unifi_ap(self):
        assert _classify_by_sysdescr("UniFi AP AC Pro, wireless access point") == "wireless_ap"


class TestMaskToPrefix:
    def test_24(self):
        assert _mask_to_prefix("255.255.255.0") == 24

    def test_16(self):
        assert _mask_to_prefix("255.255.0.0") == 16

    def test_32(self):
        assert _mask_to_prefix("255.255.255.255") == 32

    def test_30(self):
        assert _mask_to_prefix("255.255.255.252") == 30

    def test_25(self):
        assert _mask_to_prefix("255.255.255.128") == 25

    def test_8(self):
        assert _mask_to_prefix("255.0.0.0") == 8

    def test_invalid(self):
        assert _mask_to_prefix("invalid") == 24
