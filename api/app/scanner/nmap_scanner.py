"""nmap-based network scanner for host discovery and OS fingerprinting"""

import asyncio
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

# Ports probed by default. Besides the infrastructure, server and database
# ports, the list carries ports home and office devices keep open, because in
# bridge mode (TCP connect only, no ARP or ping) a device is only found when it
# answers on one of them: Apple devices (62078 lockdown, 7000 AirPlay), Sonos
# (1400), Bose SoundTouch (8090), Chromecast / Google TV (8008, 8009), Roku
# (8060), Synology / NAS (5000, 5001), IP cameras (554 RTSP), UPnP (49152).
DEFAULT_PORTS = (
    "21,22,23,25,53,80,135,139,161,443,445,515,554,631,1400,1433,3306,3389,"
    "5000,5001,5432,6379,7000,8000,8008,8009,8060,8080,8090,8443,9100,27017,"
    "49152,62078"
)

# Bridge mode finds hosts with TCP connects. nmap's unprivileged discovery
# keeps hundreds of connects to empty addresses pending at once; Docker
# Desktop's NAT then drops connects to live hosts too, and one pass over a home
# /24 found anywhere from 4 to 17 of 17 reachable hosts. Discovery therefore
# runs in Python with at most DISCOVERY_CONCURRENCY connects open (64 gave the
# same 17 hosts on every run, 256 gave 7-8), on a short list of the ports that
# answered most often. nmap then port-scans only the hosts found.
DISCOVERY_PORTS = (22, 53, 80, 135, 443, 445, 1400, 5000, 7000, 8008, 49152, 62078)
DISCOVERY_CONCURRENCY = 64
DISCOVERY_TIMEOUT = 2.0

# Ports that mark a device as a media / smart-home device (speaker, TV, cast).
MEDIA_PORTS = {1400, 7000, 8008, 8009, 8060, 8090}
# Phones and tablets: Apple's lockdown service.
MOBILE_PORTS = {62078}
# NAS web consoles (Synology DSM and compatibles).
NAS_PORTS = {5000, 5001}

# Hostname hints, applied when the ports did not settle the type.
_MEDIA_NAMES = re.compile(
    r"sonos|soundtouch|bose|chromecast|roku|appletv|apple-tv|homepod|firetv|bravia|smart-?tv|speaker|soundbar",
    re.I,
)
_MOBILE_NAMES = re.compile(r"iphone|ipad|android|galaxy|pixel", re.I)


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
    # Includes the database ports classify_device() looks for.
    ports: str = DEFAULT_PORTS,
    os_detection: bool = True,
) -> list[DiscoveredDevice]:
    """Scan a subnet with nmap for host discovery + port scan + optional OS detection.

    Args:
        subnet: CIDR notation (e.g., "192.168.1.0/24")
        ports: Comma-separated port list
        os_detection: Enable OS fingerprinting (requires root/caps)
    """
    # Validate inputs before passing to nmap subprocess
    subnet = _validate_subnet(subnet)
    ports = _validate_ports(ports)

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _scan_sync, subnet, ports, os_detection)


def _nmap_arguments(ports: str, os_detection: bool, scan_mode: str) -> str:
    """Build the nmap argument string for the given scan mode.

    * limited (bridge networking, no raw sockets): ``--unprivileged`` TCP connect
      port scan of hosts that :func:`tcp_discover` already proved live, so
      ``-Pn`` is safe here (nmap never sees an address that did not answer).
      Parallelism is capped for the same NAT reason as the discovery.
    * full (raw sockets): SYN scan with nmap's default discovery (ARP ping on the
      local segment, ICMP/TCP probes elsewhere), plus optional OS detection.
      Host discovery stays on: with ``-Pn`` over a whole range nmap reports every
      address "up", which turned each IP of a subnet into a device.
    """
    if scan_mode == "limited":
        args = ["--unprivileged", "-sT", "-Pn", "-sV", "-T4", "--max-parallelism", "64", "-p", ports]
    else:
        args = ["-sS", "-sV", "-T4", "-p", ports]
        if os_detection:
            args.append("-O")
    return " ".join(args)


async def _port_answers(ip: str, port: int, sem: asyncio.Semaphore, timeout: float) -> bool:
    """True when ``ip`` completes or refuses a TCP connect on ``port``."""
    async with sem:
        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout)
        except ConnectionRefusedError:
            return True  # a RST proves the host is alive
        except (asyncio.TimeoutError, OSError):
            return False
        writer.close()
        return True


async def _host_answers(ip: str, ports, sem: asyncio.Semaphore, timeout: float) -> bool:
    tasks = [asyncio.create_task(_port_answers(ip, p, sem, timeout)) for p in ports]
    try:
        for task in asyncio.as_completed(tasks):
            if await task:
                return True
        return False
    finally:
        for task in tasks:
            task.cancel()


async def tcp_discover(
    subnet: str,
    ports=DISCOVERY_PORTS,
    concurrency: int = DISCOVERY_CONCURRENCY,
    timeout: float = DISCOVERY_TIMEOUT,
) -> set[str]:
    """Live host addresses of ``subnet`` by TCP connect (bridge mode).

    A host is live when any probe port accepts or refuses the connection. At
    most ``concurrency`` connects are open at a time, see DISCOVERY_PORTS.
    """
    net = ipaddress.ip_network(subnet, strict=False)
    hosts = [str(h) for h in net.hosts()]
    sem = asyncio.Semaphore(concurrency)
    alive = await asyncio.gather(*(_host_answers(h, ports, sem, timeout) for h in hosts))
    return {h for h, up in zip(hosts, alive) if up}


def _scan_sync(subnet: str, ports: str, os_detection: bool) -> list[DiscoveredDevice]:
    """Synchronous nmap scan (runs in thread pool)."""
    scanner = nmap.PortScanner()

    scan_mode = os.getenv("SCAN_MODE", "full")
    arguments = _nmap_arguments(ports, os_detection, scan_mode)
    known_live: set[str] = set()
    try:
        if scan_mode == "limited":
            # Runs in a worker thread (see scan_subnet), which has no event loop.
            known_live = asyncio.run(tcp_discover(subnet))
            logger.info("TCP discovery found %d live hosts in %s", len(known_live), subnet)
            if not known_live:
                logger.info("nmap found no live hosts in %s", subnet)
                return []
            targets = " ".join(sorted(known_live, key=ipaddress.ip_address))
        else:
            targets = subnet
        logger.info("nmap scan (%s mode): %s %s", scan_mode, subnet, arguments)
        scanner.scan(hosts=targets, arguments=arguments)
    except nmap.PortScannerError as e:
        logger.error("nmap scan failed: %s", e)
        return []

    hosts = {host: scanner[host] for host in scanner.all_hosts()}
    devices = parse_nmap_hosts(hosts, subnet, known_live)
    logger.info("nmap found %d live hosts in %s", len(devices), subnet)
    return devices


def is_host_address(ip: str, subnet: str) -> bool:
    """True when ``ip`` is a usable host address of ``subnet``.

    Network and broadcast addresses are never devices. /31 and /32 have no
    network/broadcast address (RFC 3021), so every address there is a host.
    """
    try:
        addr = ipaddress.ip_address(ip)
        net = ipaddress.ip_network(subnet, strict=False)
    except ValueError:
        return False
    if addr not in net:
        return False
    if net.version == 4 and net.prefixlen >= 31:
        return True
    return addr != net.network_address and addr != net.broadcast_address


def parse_nmap_hosts(hosts: dict, subnet: str, known_live: Optional[set[str]] = None) -> list[DiscoveredDevice]:
    """Turn nmap per-host results into devices - live, responding hosts only.

    A host is skipped when nmap did not see it up, when its "up" state was only
    assumed (``reason == "user-set"``, i.e. ``-Pn``) and no port answered, or when
    it is the network or broadcast address of the scanned subnet. Hosts in
    ``known_live`` already answered a discovery pass and are kept even when the
    port scan saw nothing.
    """
    known_live = known_live or set()
    devices: list[DiscoveredDevice] = []

    for host, data in hosts.items():
        status = data.get("status", {}) or {}
        if status.get("state") != "up":
            continue
        if not is_host_address(host, subnet):
            continue

        # Ports that answered at all (open or closed) prove the host exists.
        open_ports: list[int] = []
        answered = False
        for proto in ("tcp", "udp"):
            for port_num, port_data in (data.get(proto) or {}).items():
                state = port_data.get("state")
                if state == "open":
                    open_ports.append(int(port_num))
                if state in ("open", "closed"):
                    answered = True

        if status.get("reason") == "user-set" and not answered and host not in known_live:
            continue

        hostnames = data.get("hostnames") or []
        hostname = hostnames[0].get("name") if hostnames and hostnames[0].get("name") else None

        os_family = None
        os_version = None
        osmatch = data.get("osmatch") or []
        if osmatch:
            best_match = osmatch[0]
            os_family = best_match.get("name", "")
            osclass = best_match.get("osclass") or []
            if osclass:
                os_family = osclass[0].get("osfamily", os_family)
                os_version = osclass[0].get("osgen", "")

        # MAC address (only available from the same L2 segment)
        mac = (data.get("addresses") or {}).get("mac")
        vendor = None
        if mac and mac in (data.get("vendor") or {}):
            vendor = data["vendor"][mac]

        device_type = classify_device(open_ports, os_family)
        device_type = refine_by_hostname(device_type, hostname)
        devices.append(DiscoveredDevice(
            ip_address=host,
            hostname=hostname,
            mac_address=mac,
            vendor=vendor,
            device_type=device_type,
            os_family=os_family,
            os_version=os_version,
            open_ports=sorted(open_ports),
        ))

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

    # Phones and tablets
    if port_set & MOBILE_PORTS:
        return "endpoint"

    # Speakers, TVs and cast devices
    if port_set & MEDIA_PORTS:
        return "media"

    # Network management + no typical server ports = likely switch/router
    if 161 in port_set and not (port_set & {80, 443, 22, 8080}):
        return "switch"

    # Typical server services, NAS consoles
    if port_set & ({3306, 5432, 6379, 27017} | NAS_PORTS):
        return "server"

    # Windows endpoints — SMB, RPC, RDP
    if port_set & {135, 139, 445, 3389}:
        return "endpoint"

    # SSH or HTTPS: likely a server
    if port_set & {22, 443}:
        return "server"

    # Only a web page (80/8000/8080): most often an appliance's web UI
    # (camera, speaker, smart plug), not a server; leave it unclassified.
    if port_set and port_set <= {80, 8000, 8080, 49152}:
        return "unknown"

    # No open ports + embedded OS = likely network device
    if not open_ports and os_family:
        lower = os_family.lower()
        if any(kw in lower for kw in ["embedded", "freebsd", "openbsd"]):
            return "router"

    # A live host that answered on other ports is most likely offering a service;
    # one with nothing open is most likely a client.
    if open_ports:
        return "server"
    return "endpoint"


def refine_by_hostname(device_type: str, hostname: Optional[str]) -> str:
    """Use the DNS name when the ports left the type open or generic."""
    if not hostname or device_type not in ("unknown", "endpoint", "server"):
        return device_type
    if _MEDIA_NAMES.search(hostname):
        return "media"
    if _MOBILE_NAMES.search(hostname):
        return "endpoint"
    return device_type


def reverse_dns(ips: list[str], dns_server: str) -> dict[str, str]:
    """PTR names for ``ips`` from ``dns_server`` (typically the LAN router).

    Home and office routers answer reverse lookups for their DHCP clients, but
    the scanner's own resolver (Docker's) does not know those names. nmap's
    list scan (-sL) sends nothing to the targets; it only asks the DNS server.
    """
    if not ips:
        return {}
    ipaddress.ip_address(dns_server)  # never pass anything else to nmap
    for ip in ips:
        ipaddress.ip_address(ip)
    scanner = nmap.PortScanner()
    try:
        scanner.scan(hosts=" ".join(ips), arguments=f"-sL -R --dns-servers {dns_server}")
    except nmap.PortScannerError as e:
        logger.warning("reverse DNS via %s failed: %s", dns_server, e)
        return {}
    names: dict[str, str] = {}
    for ip in scanner.all_hosts():
        hostnames = scanner[ip].get("hostnames") or []
        name = hostnames[0].get("name") if hostnames else None
        if name:
            names[ip] = name
    return names


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
