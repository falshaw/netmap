"""nmap-based network scanner for host discovery and OS fingerprinting"""

import ipaddress
import logging
import os
import platform
import re
from typing import Optional
import nmap

from app.scanner.models import DiscoveredDevice

# Windows: nmap installs to Program Files but may not be in PATH
# Inject into os.environ["PATH"] so python-nmap subprocess can find it
if platform.system() == "Windows":
    for candidate in [
        r"C:\Program Files (x86)\Nmap",
        r"C:\Program Files\Nmap",
    ]:
        if os.path.isfile(os.path.join(candidate, "nmap.exe")):
            if candidate not in os.environ.get("PATH", ""):
                os.environ["PATH"] = candidate + ";" + os.environ.get("PATH", "")
            break

logger = logging.getLogger(__name__)

# Port-based device classification rules
DEVICE_TYPE_PORTS = {
    "printer": [9100, 515, 631],
    "switch": [161],
    "server": [22, 80, 443, 8080, 3306, 5432, 6379, 27017],
    "endpoint": [135, 139, 445, 3389],
    "wireless_ap": [8443],
}


_PORTS_RE = re.compile(r"^[0-9]+([,-][0-9]+)*$")


def _validate_subnet(subnet: str) -> str:
    """Validate and normalize a CIDR subnet string. Raises ValueError on bad input."""
    network = ipaddress.ip_network(subnet, strict=False)
    return str(network)


def _validate_ports(ports: str) -> str:
    """Validate port specification (digits, commas, hyphens only). Raises ValueError on bad input."""
    ports = ports.strip()
    if not _PORTS_RE.match(ports):
        raise ValueError(f"Invalid port specification: {ports!r}")
    return ports


async def scan_subnet(
    subnet: str,
    ports: str = "22,23,53,80,135,139,161,443,445,3389,8080,8443,9100",
    os_detection: bool = True,
) -> list[DiscoveredDevice]:
    """Scan a subnet with nmap for host discovery + port scan + optional OS detection.

    Args:
        subnet: CIDR notation (e.g., "192.168.1.0/24")
        ports: Comma-separated port list
        os_detection: Enable OS fingerprinting (requires root/caps)
    """
    import asyncio

    # Validate inputs before passing to nmap subprocess
    subnet = _validate_subnet(subnet)
    ports = _validate_ports(ports)

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _scan_sync, subnet, ports, os_detection)


def _scan_sync(subnet: str, ports: str, os_detection: bool) -> list[DiscoveredDevice]:
    """Synchronous nmap scan (runs in thread pool)."""
    scanner = nmap.PortScanner()
    devices = []

    scan_mode = os.getenv("SCAN_MODE", "full")
    if scan_mode == "limited":
        # TCP connect scan — no raw sockets needed (Windows/Mac Docker)
        args = ["-sT", "-Pn", "-sV", "-T4", "-p", ports]
        logger.info("Scan mode: limited (TCP connect, no OS detection)")
    else:
        args = ["-sS", "-sV", "-T4", "-p", ports]
        if os_detection:
            args.append("-O")

    try:
        arguments = " ".join(args)
        logger.info("nmap scan: %s %s", subnet, arguments)
        scanner.scan(hosts=subnet, arguments=arguments)
    except nmap.PortScannerError as e:
        logger.error("nmap scan failed: %s", e)
        return devices

    for host in scanner.all_hosts():
        if scanner[host].state() != "up":
            continue

        hostnames = scanner[host].hostnames()
        hostname = hostnames[0]["name"] if hostnames and hostnames[0]["name"] else None

        # OS detection results
        os_family = None
        os_version = None
        if "osmatch" in scanner[host] and scanner[host]["osmatch"]:
            best_match = scanner[host]["osmatch"][0]
            os_family = best_match.get("name", "")
            if "osclass" in best_match and best_match["osclass"]:
                os_class = best_match["osclass"][0]
                os_family = os_class.get("osfamily", os_family)
                os_version = os_class.get("osgen", "")

        # Get open ports for classification
        open_ports = []
        for proto in ["tcp", "udp"]:
            if proto in scanner[host]:
                for port_num, port_data in scanner[host][proto].items():
                    if port_data.get("state") == "open":
                        open_ports.append(port_num)

        # MAC address (only available from same subnet)
        mac = None
        vendor = None
        if "mac" in scanner[host].get("addresses", {}):
            mac = scanner[host]["addresses"]["mac"]
        if "vendor" in scanner[host] and mac and mac in scanner[host]["vendor"]:
            vendor = scanner[host]["vendor"][mac]

        device_type = classify_device(open_ports, os_family)

        devices.append(DiscoveredDevice(
            ip_address=host,
            hostname=hostname,
            mac_address=mac,
            vendor=vendor,
            device_type=device_type,
            os_family=os_family,
            os_version=os_version,
        ))

    logger.info("nmap found %d hosts in %s", len(devices), subnet)
    return devices


def classify_device(open_ports: list[int], os_family: Optional[str] = None) -> str:
    """Classify device type based on open ports and OS fingerprint."""
    if os_family:
        lower = os_family.lower()
        if any(kw in lower for kw in ["ios", "junos", "pan-os", "fortios"]):
            return "firewall" if "pan-os" in lower or "fortios" in lower else "router"
        if "printer" in lower or "jetdirect" in lower:
            return "printer"
        if any(kw in lower for kw in ["embedded", "f5", "freebsd"]) and not open_ports:
            return "router"

    # Port-based classification
    port_set = set(open_ports)

    # Printer ports are distinctive
    if port_set & {9100, 515, 631}:
        return "printer"

    # Network management + no typical server ports = likely switch/router
    if 161 in port_set and not (port_set & {80, 443, 22, 8080}):
        return "switch"

    # Typical server services
    if port_set & {3306, 5432, 6379, 27017, 8080}:
        return "server"

    # Windows endpoints — SMB, RPC, RDP
    if port_set & {135, 139, 445, 3389}:
        return "endpoint"

    # SSH + HTTP likely a server
    if port_set & {22, 80, 443}:
        return "server"

    # No open ports + embedded OS = likely network device
    if not open_ports and os_family:
        lower = os_family.lower()
        if any(kw in lower for kw in ["embedded", "freebsd", "openbsd"]):
            return "router"

    return "unknown"


def mac_vendor_lookup(mac: str) -> Optional[str]:
    """Lookup MAC vendor from OUI prefix.
    Uses a small built-in table for common networking vendors.
    """
    if not mac or len(mac) < 8:
        return None

    prefix = mac[:8].upper().replace("-", ":")
    return COMMON_OUI.get(prefix)


# Common networking equipment OUI prefixes
COMMON_OUI = {
    "00:1A:1E": "Aruba Networks",
    "00:1B:17": "Palo Alto Networks",
    "00:09:0F": "Fortinet",
    "00:1C:7F": "Check Point",
    "00:00:0C": "Cisco Systems",
    "00:01:42": "Cisco Systems",
    "00:1A:A1": "Cisco Systems",
    "00:50:56": "VMware",
    "00:0C:29": "VMware",
    "00:15:5D": "Microsoft (Hyper-V)",
    "00:1E:68": "Juniper Networks",
    "00:23:9C": "Juniper Networks",
    "00:1F:12": "Juniper Networks",
    "00:05:85": "Juniper Networks",
    "00:1A:8C": "Sophos",
    "00:90:FB": "Portwell (SonicWall)",
    "F0:9F:C2": "Ubiquiti",
    "24:5A:4C": "Ubiquiti",
    "00:27:22": "Ubiquiti",
    "DC:9F:DB": "Ubiquiti",
    "B4:FB:E4": "Ubiquiti",
    "00:1E:58": "D-Link",
    "28:10:7B": "D-Link",
    "00:11:32": "Synology",
    "00:1B:21": "Intel",
    "00:1E:67": "Intel",
    "3C:FD:FE": "Intel",
    "A0:36:9F": "Intel",
    "AC:1F:6B": "Super Micro",
    "00:25:90": "Super Micro",
    "00:0E:0C": "HP / Aruba",
    "00:1A:4B": "HP",
    "30:E1:71": "HP",
    "00:1B:78": "Hewlett-Packard",
    "00:17:A4": "Dell",
    "00:14:22": "Dell",
    "F0:1F:AF": "Dell",
    "24:6E:96": "Dell",
    "00:04:96": "Extreme Networks",
    "00:E0:2B": "Extreme Networks",
    "C4:01:7C": "Ruckus",
    "00:24:82": "Ruckus",
}
