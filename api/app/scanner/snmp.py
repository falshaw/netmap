"""SNMP discovery module — queries network devices for topology data"""

import logging
import time
from typing import Optional

from pysnmp.hlapi.v3arch.asyncio import (
    CommunityData,
    UsmUserData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    get_cmd,
    bulk_cmd,
    SnmpEngine,
)

from app.scanner.models import (
    DiscoveredDevice,
    DiscoveredInterface,
    DiscoveredNeighbor,
    DiscoveredRoute,
    DiscoveredVlan,
    ArpEntry,
)

logger = logging.getLogger(__name__)

# Standard MIB OIDs
OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYS_OBJECT_ID = "1.3.6.1.2.1.1.2.0"
OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
OID_SYS_LOCATION = "1.3.6.1.2.1.1.6.0"
OID_SYS_CONTACT = "1.3.6.1.2.1.1.4.0"
OID_SYS_UPTIME = "1.3.6.1.2.1.1.3.0"

# IF-MIB
OID_IF_DESCR = "1.3.6.1.2.1.2.2.1.2"
OID_IF_TYPE = "1.3.6.1.2.1.2.2.1.3"
OID_IF_MTU = "1.3.6.1.2.1.2.2.1.4"
OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5"
OID_IF_PHYS_ADDRESS = "1.3.6.1.2.1.2.2.1.6"
OID_IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"
OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"
OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10"
OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16"
OID_IF_IN_ERRORS = "1.3.6.1.2.1.2.2.1.14"
OID_IF_OUT_ERRORS = "1.3.6.1.2.1.2.2.1.20"
OID_IF_HIGH_SPEED = "1.3.6.1.2.1.31.1.1.1.15"
OID_IF_NAME = "1.3.6.1.2.1.31.1.1.1.1"
OID_IF_ALIAS = "1.3.6.1.2.1.31.1.1.1.18"
OID_IF_HC_IN_OCTETS = "1.3.6.1.2.1.31.1.1.1.6"
OID_IF_HC_OUT_OCTETS = "1.3.6.1.2.1.31.1.1.1.10"

# IP-MIB
OID_IP_ADDR_TABLE = "1.3.6.1.2.1.4.20.1"
OID_IP_ADDR_IF_INDEX = "1.3.6.1.2.1.4.20.1.2"
OID_IP_ADDR_NET_MASK = "1.3.6.1.2.1.4.20.1.3"

# ARP (ipNetToMedia)
OID_ARP_TABLE = "1.3.6.1.2.1.4.22.1"
OID_ARP_PHYS_ADDRESS = "1.3.6.1.2.1.4.22.1.2"
OID_ARP_NET_ADDRESS = "1.3.6.1.2.1.4.22.1.3"

# CDP-MIB
OID_CDP_CACHE = "1.3.6.1.4.1.9.9.23.1.2.1.1"
OID_CDP_CACHE_DEVICE_ID = "1.3.6.1.4.1.9.9.23.1.2.1.1.6"
OID_CDP_CACHE_DEVICE_PORT = "1.3.6.1.4.1.9.9.23.1.2.1.1.7"
OID_CDP_CACHE_ADDRESS = "1.3.6.1.4.1.9.9.23.1.2.1.1.4"
OID_CDP_CACHE_PLATFORM = "1.3.6.1.4.1.9.9.23.1.2.1.1.8"

# LLDP-MIB
OID_LLDP_REM_TABLE = "1.0.8802.1.1.2.1.4.1.1"
OID_LLDP_REM_SYS_NAME = "1.0.8802.1.1.2.1.4.1.1.9"
OID_LLDP_REM_PORT_DESC = "1.0.8802.1.1.2.1.4.1.1.8"
OID_LLDP_REM_PORT_ID = "1.0.8802.1.1.2.1.4.1.1.7"
OID_LLDP_REM_MAN_ADDR = "1.0.8802.1.1.2.1.4.2.1"

# VLAN (Cisco VLAN-MIB)
OID_VLAN_TABLE = "1.3.6.1.4.1.9.9.46.1.3.1.1"
OID_VLAN_STATE = "1.3.6.1.4.1.9.9.46.1.3.1.1.2"
OID_VLAN_NAME = "1.3.6.1.4.1.9.9.46.1.3.1.1.4"

# Routing table
OID_IP_ROUTE_TABLE = "1.3.6.1.2.1.4.21.1"
OID_IP_ROUTE_DEST = "1.3.6.1.2.1.4.21.1.1"
OID_IP_ROUTE_NEXT_HOP = "1.3.6.1.2.1.4.21.1.7"
OID_IP_ROUTE_MASK = "1.3.6.1.2.1.4.21.1.11"
OID_IP_ROUTE_PROTO = "1.3.6.1.2.1.4.21.1.9"
OID_IP_ROUTE_METRIC = "1.3.6.1.2.1.4.21.1.3"
OID_IP_ROUTE_IF_INDEX = "1.3.6.1.2.1.4.21.1.2"

IF_ADMIN_STATUS_MAP = {"1": "up", "2": "down", "3": "testing"}
IF_OPER_STATUS_MAP = {"1": "up", "2": "down", "3": "testing", "4": "unknown", "5": "dormant"}
ROUTE_PROTO_MAP = {
    "1": "other", "2": "local", "3": "netmgmt", "4": "icmp",
    "8": "rip", "13": "ospf", "14": "bgp", "16": "isis",
}


def _get_auth_data(
    community: Optional[str] = None,
    version: str = "2c",
    v3_user: Optional[str] = None,
    v3_auth_protocol: Optional[str] = None,
    v3_auth_password: Optional[str] = None,
    v3_priv_protocol: Optional[str] = None,
    v3_priv_password: Optional[str] = None,
):
    """Build SNMP auth data for v2c or v3."""
    if version == "3" and v3_user:
        # Validate that v3 auth/priv passwords are non-empty when protocols are specified
        if v3_auth_protocol and not v3_auth_password:
            raise ValueError("SNMPv3 auth password must not be empty when auth protocol is set")
        if v3_priv_protocol and not v3_priv_password:
            raise ValueError("SNMPv3 priv password must not be empty when priv protocol is set")

        from pysnmp.hlapi.v3arch.asyncio import (
            usmHMACMD5AuthProtocol, usmHMACSHAAuthProtocol,
            usmHMAC128SHA224AuthProtocol, usmHMAC192SHA256AuthProtocol,
            usmDESPrivProtocol, usm3DESEDEPrivProtocol,
            usmAesCfb128Protocol, usmAesCfb192Protocol, usmAesCfb256Protocol,
        )
        AUTH_PROTOCOLS = {
            "md5": usmHMACMD5AuthProtocol,
            "sha": usmHMACSHAAuthProtocol,
            "sha224": usmHMAC128SHA224AuthProtocol,
            "sha256": usmHMAC192SHA256AuthProtocol,
        }
        PRIV_PROTOCOLS = {
            "des": usmDESPrivProtocol,
            "3des": usm3DESEDEPrivProtocol,
            "aes": usmAesCfb128Protocol,
            "aes128": usmAesCfb128Protocol,
            "aes192": usmAesCfb192Protocol,
            "aes256": usmAesCfb256Protocol,
        }
        auth_proto = AUTH_PROTOCOLS.get((v3_auth_protocol or "").lower(), usmHMACSHAAuthProtocol) if v3_auth_protocol else None
        priv_proto = PRIV_PROTOCOLS.get((v3_priv_protocol or "").lower(), usmAesCfb128Protocol) if v3_priv_protocol else None
        return UsmUserData(
            v3_user,
            authKey=v3_auth_password or "",
            privKey=v3_priv_password or "",
            authProtocol=auth_proto,
            privProtocol=priv_proto,
        )
    return CommunityData(community or "public", mpModel=1 if version == "2c" else 0)


def _mac_bytes_to_str(raw: bytes) -> str:
    """Convert raw MAC bytes to colon-separated hex string."""
    if isinstance(raw, bytes) and len(raw) == 6:
        return ":".join(f"{b:02x}" for b in raw)
    return str(raw)


def _to_mac_bytes(val) -> bytes:
    """Convert pysnmp MAC value (str or bytes) to raw bytes.

    pysnmp prettyPrint() returns hex like '0x001a2b3c4d5e' or raw bytes.
    """
    if isinstance(val, bytes):
        return val
    if isinstance(val, str):
        cleaned = val.strip()
        if cleaned.startswith("0x") or cleaned.startswith("0X"):
            hex_str = cleaned[2:]
            try:
                return bytes.fromhex(hex_str)
            except ValueError:
                pass
        # Try latin-1 decode as fallback for raw octet strings
        try:
            raw = cleaned.encode("latin-1")
            if len(raw) == 6:
                return raw
        except (UnicodeDecodeError, UnicodeEncodeError):
            pass
    return b""


async def _snmp_get(target: str, port: int, auth_data, oids: list[str]) -> dict[str, str]:
    """SNMP GET for specific OIDs."""
    result = {}
    engine = SnmpEngine()
    try:
        error_indication, error_status, error_index, var_binds = await get_cmd(
            engine,
            auth_data,
            await UdpTransportTarget.create((target, port), timeout=5, retries=2),
            ContextData(),
            *[ObjectType(ObjectIdentity(oid)) for oid in oids],
        )
        if error_indication or error_status:
            logger.warning("SNMP GET error for %s: %s / %s", target, error_indication, error_status)
            return result
        for var_bind in var_binds:
            oid_str = str(var_bind[0])
            val = var_bind[1]
            if hasattr(val, "prettyPrint"):
                result[oid_str] = val.prettyPrint()
            else:
                result[oid_str] = str(val)
    finally:
        engine.close_dispatcher()
    return result


async def _snmp_walk(target: str, port: int, auth_data, base_oid: str) -> list[tuple[str, str]]:
    """SNMP BULK WALK for a subtree."""
    results = []
    engine = SnmpEngine()
    try:
        transport = await UdpTransportTarget.create((target, port), timeout=5, retries=2)
        async for error_indication, error_status, error_index, var_binds in bulk_cmd(
            engine,
            auth_data,
            transport,
            ContextData(),
            0, 25,
            ObjectType(ObjectIdentity(base_oid)),
            lexicographicMode=False,
        ):
            if error_indication or error_status:
                break
            for var_bind in var_binds:
                oid_str = str(var_bind[0])
                if not oid_str.startswith(base_oid):
                    return results
                val = var_bind[1]
                if hasattr(val, "prettyPrint"):
                    results.append((oid_str, val.prettyPrint()))
                else:
                    results.append((oid_str, str(val)))
    finally:
        engine.close_dispatcher()
    return results


async def snmp_get_system(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    **v3_kwargs,
) -> Optional[DiscoveredDevice]:
    """Get system info via SNMP sysDescr, sysName, sysLocation, sysContact, sysUpTime."""
    auth = _get_auth_data(community, version, **v3_kwargs)
    oids = [OID_SYS_DESCR, OID_SYS_OBJECT_ID, OID_SYS_NAME, OID_SYS_LOCATION, OID_SYS_CONTACT, OID_SYS_UPTIME]
    data = await _snmp_get(target, port, auth, oids)
    if not data:
        return None

    uptime_raw = data.get(OID_SYS_UPTIME, "0")
    try:
        uptime_seconds = int(uptime_raw) // 100
    except (ValueError, TypeError):
        uptime_seconds = 0

    return DiscoveredDevice(
        ip_address=target,
        sys_name=data.get(OID_SYS_NAME, ""),
        sys_descr=data.get(OID_SYS_DESCR, ""),
        sys_object_id=data.get(OID_SYS_OBJECT_ID, ""),
        sys_location=data.get(OID_SYS_LOCATION, ""),
        sys_contact=data.get(OID_SYS_CONTACT, ""),
        uptime_seconds=uptime_seconds,
        snmp_reachable=True,
        hostname=data.get(OID_SYS_NAME, ""),
        device_type=_classify_by_sysdescr(data.get(OID_SYS_DESCR, "")),
    )


def _classify_by_sysdescr(sys_descr: str) -> str:
    """Classify device type from sysDescr string."""
    lower = sys_descr.lower()
    if any(kw in lower for kw in ["palo alto", "pan-os", "fortigate", "fortios", "asa", "firepower", "sophos", "watchguard", "srx"]):
        return "firewall"
    if any(kw in lower for kw in ["catalyst", "nexus", "arista", "switch", "juniper ex", "procurve"]):
        return "switch"
    if any(kw in lower for kw in ["cisco ios", "junos", "router", "vyos", "mikrotik"]):
        return "router"
    if any(kw in lower for kw in ["linux", "ubuntu", "centos", "debian", "rhel", "windows server"]):
        return "server"
    if any(kw in lower for kw in ["windows", "macos", "darwin"]):
        return "endpoint"
    if any(kw in lower for kw in ["printer", "jetdirect", "xerox", "canon"]):
        return "printer"
    if any(kw in lower for kw in ["access point", "wireless", "aironet", "unifi"]):
        return "wireless_ap"
    return "unknown"


async def snmp_get_interfaces(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    **v3_kwargs,
) -> list[DiscoveredInterface]:
    """Get all interfaces via IF-MIB."""
    auth = _get_auth_data(community, version, **v3_kwargs)
    interfaces: dict[int, DiscoveredInterface] = {}

    # Walk interface descriptions to discover all if_indexes
    descr_data = await _snmp_walk(target, port, auth, OID_IF_DESCR)
    for oid, val in descr_data:
        idx = int(oid.split(".")[-1])
        interfaces[idx] = DiscoveredInterface(if_index=idx, description=val)

    # Walk interface names (ifName from IF-MIB extension)
    name_data = await _snmp_walk(target, port, auth, OID_IF_NAME)
    for oid, val in name_data:
        idx = int(oid.split(".")[-1])
        if idx in interfaces:
            interfaces[idx].name = val

    # Speed (ifHighSpeed in Mbps)
    speed_data = await _snmp_walk(target, port, auth, OID_IF_HIGH_SPEED)
    for oid, val in speed_data:
        idx = int(oid.split(".")[-1])
        if idx in interfaces:
            try:
                interfaces[idx].speed_mbps = int(val)
            except ValueError:
                pass

    # Fallback to ifSpeed (bps) for devices without ifHighSpeed
    if not speed_data:
        speed_data = await _snmp_walk(target, port, auth, OID_IF_SPEED)
        for oid, val in speed_data:
            idx = int(oid.split(".")[-1])
            if idx in interfaces:
                try:
                    interfaces[idx].speed_mbps = int(val) // 1_000_000
                except ValueError:
                    pass

    # Admin + oper status
    for oid_base, attr in [(OID_IF_ADMIN_STATUS, "admin_status"), (OID_IF_OPER_STATUS, "oper_status")]:
        status_data = await _snmp_walk(target, port, auth, oid_base)
        status_map = IF_ADMIN_STATUS_MAP if attr == "admin_status" else IF_OPER_STATUS_MAP
        for oid, val in status_data:
            idx = int(oid.split(".")[-1])
            if idx in interfaces:
                setattr(interfaces[idx], attr, status_map.get(val, "unknown"))

    # MAC address
    mac_data = await _snmp_walk(target, port, auth, OID_IF_PHYS_ADDRESS)
    for oid, val in mac_data:
        idx = int(oid.split(".")[-1])
        if idx in interfaces and val and val != "0x":
            interfaces[idx].mac_address = _mac_bytes_to_str(_to_mac_bytes(val))

    # MTU
    mtu_data = await _snmp_walk(target, port, auth, OID_IF_MTU)
    for oid, val in mtu_data:
        idx = int(oid.split(".")[-1])
        if idx in interfaces:
            try:
                interfaces[idx].mtu = int(val)
            except ValueError:
                pass

    # Interface type
    type_data = await _snmp_walk(target, port, auth, OID_IF_TYPE)
    for oid, val in type_data:
        idx = int(oid.split(".")[-1])
        if idx in interfaces:
            interfaces[idx].if_type = val

    # IP addresses mapped to interfaces
    ip_if_data = await _snmp_walk(target, port, auth, OID_IP_ADDR_IF_INDEX)
    ip_mask_data = await _snmp_walk(target, port, auth, OID_IP_ADDR_NET_MASK)
    mask_map = {oid.replace(OID_IP_ADDR_NET_MASK + ".", ""): val for oid, val in ip_mask_data}
    for oid, val in ip_if_data:
        ip_addr = oid.replace(OID_IP_ADDR_IF_INDEX + ".", "")
        try:
            idx = int(val)
        except ValueError:
            continue
        if idx in interfaces:
            interfaces[idx].ip_address = ip_addr
            interfaces[idx].subnet_mask = mask_map.get(ip_addr, "255.255.255.0")

    # Counter values (in/out octets, errors)
    for oid_base, attr in [
        (OID_IF_HC_IN_OCTETS, "in_octets"),
        (OID_IF_HC_OUT_OCTETS, "out_octets"),
        (OID_IF_IN_ERRORS, "in_errors"),
        (OID_IF_OUT_ERRORS, "out_errors"),
    ]:
        counter_data = await _snmp_walk(target, port, auth, oid_base)
        for oid, val in counter_data:
            idx = int(oid.split(".")[-1])
            if idx in interfaces:
                try:
                    setattr(interfaces[idx], attr, int(val))
                except ValueError:
                    pass

    return list(interfaces.values())


async def snmp_get_interface_utilization(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    interval: int = 30,
    **v3_kwargs,
) -> dict[int, tuple[float, float]]:
    """Measure interface utilization by sampling counters twice with interval seconds apart.
    Returns {if_index: (in_util_pct, out_util_pct)}.
    """
    auth = _get_auth_data(community, version, **v3_kwargs)

    async def _get_counters():
        in_data = await _snmp_walk(target, port, auth, OID_IF_HC_IN_OCTETS)
        out_data = await _snmp_walk(target, port, auth, OID_IF_HC_OUT_OCTETS)
        speed_data = await _snmp_walk(target, port, auth, OID_IF_HIGH_SPEED)
        counters = {}
        for oid, val in in_data:
            idx = int(oid.split(".")[-1])
            counters.setdefault(idx, {})["in"] = int(val)
        for oid, val in out_data:
            idx = int(oid.split(".")[-1])
            counters.setdefault(idx, {})["out"] = int(val)
        for oid, val in speed_data:
            idx = int(oid.split(".")[-1])
            counters.setdefault(idx, {})["speed_mbps"] = int(val)
        return counters

    sample1 = await _get_counters()
    await _async_sleep(interval)
    sample2 = await _get_counters()

    utilization = {}
    for idx in sample1:
        if idx not in sample2:
            continue
        s1, s2 = sample1[idx], sample2[idx]
        speed_mbps = s2.get("speed_mbps", 0)
        if speed_mbps == 0:
            continue
        speed_bps = speed_mbps * 1_000_000
        delta_in = (s2.get("in", 0) - s1.get("in", 0)) * 8
        delta_out = (s2.get("out", 0) - s1.get("out", 0)) * 8
        in_util = min((delta_in / interval / speed_bps) * 100, 100.0) if speed_bps else 0
        out_util = min((delta_out / interval / speed_bps) * 100, 100.0) if speed_bps else 0
        utilization[idx] = (round(in_util, 2), round(out_util, 2))

    return utilization


async def _async_sleep(seconds: int):
    """Async sleep wrapper."""
    import asyncio
    await asyncio.sleep(seconds)


async def snmp_get_arp_table(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    **v3_kwargs,
) -> list[ArpEntry]:
    """Get ARP table via ipNetToMediaTable."""
    auth = _get_auth_data(community, version, **v3_kwargs)
    entries = []

    phys_data = await _snmp_walk(target, port, auth, OID_ARP_PHYS_ADDRESS)
    net_data = await _snmp_walk(target, port, auth, OID_ARP_NET_ADDRESS)
    net_map = {}
    for oid, val in net_data:
        suffix = oid.replace(OID_ARP_NET_ADDRESS + ".", "")
        net_map[suffix] = val

    for oid, val in phys_data:
        suffix = oid.replace(OID_ARP_PHYS_ADDRESS + ".", "")
        ip = net_map.get(suffix)
        if ip and val:
            mac = _mac_bytes_to_str(_to_mac_bytes(val))
            # suffix format: if_index.ip, extract interface index
            parts = suffix.split(".", 1)
            if_name = parts[0] if len(parts) > 1 else None
            entries.append(ArpEntry(ip_address=ip, mac_address=mac, interface=if_name))

    return entries


async def snmp_get_cdp_neighbors(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    **v3_kwargs,
) -> list[DiscoveredNeighbor]:
    """Get CDP neighbors (Cisco devices)."""
    auth = _get_auth_data(community, version, **v3_kwargs)
    neighbors = []

    device_id_data = await _snmp_walk(target, port, auth, OID_CDP_CACHE_DEVICE_ID)
    port_data = await _snmp_walk(target, port, auth, OID_CDP_CACHE_DEVICE_PORT)
    addr_data = await _snmp_walk(target, port, auth, OID_CDP_CACHE_ADDRESS)
    platform_data = await _snmp_walk(target, port, auth, OID_CDP_CACHE_PLATFORM)

    port_map = {oid.replace(OID_CDP_CACHE_DEVICE_PORT + ".", ""): val for oid, val in port_data}
    addr_map = {oid.replace(OID_CDP_CACHE_ADDRESS + ".", ""): val for oid, val in addr_data}
    plat_map = {oid.replace(OID_CDP_CACHE_PLATFORM + ".", ""): val for oid, val in platform_data}

    for oid, device_id in device_id_data:
        suffix = oid.replace(OID_CDP_CACHE_DEVICE_ID + ".", "")
        parts = suffix.split(".")
        local_if_index = parts[0] if parts else "0"

        raw_addr = addr_map.get(suffix, "")
        remote_ip = None
        if raw_addr and len(raw_addr) >= 4:
            try:
                octets = raw_addr.encode("latin-1") if isinstance(raw_addr, str) else raw_addr
                if len(octets) == 4:
                    remote_ip = ".".join(str(b) for b in octets)
            except Exception:
                pass

        neighbors.append(DiscoveredNeighbor(
            local_interface=local_if_index,
            remote_device_id=device_id,
            remote_hostname=device_id,
            remote_ip=remote_ip,
            remote_interface=port_map.get(suffix, ""),
            remote_platform=plat_map.get(suffix, ""),
            protocol="cdp",
        ))

    return neighbors


async def snmp_get_lldp_neighbors(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    **v3_kwargs,
) -> list[DiscoveredNeighbor]:
    """Get LLDP neighbors (vendor-neutral)."""
    auth = _get_auth_data(community, version, **v3_kwargs)
    neighbors = []

    sys_name_data = await _snmp_walk(target, port, auth, OID_LLDP_REM_SYS_NAME)
    port_id_data = await _snmp_walk(target, port, auth, OID_LLDP_REM_PORT_ID)
    port_desc_data = await _snmp_walk(target, port, auth, OID_LLDP_REM_PORT_DESC)

    port_id_map = {oid.replace(OID_LLDP_REM_PORT_ID + ".", ""): val for oid, val in port_id_data}
    port_desc_map = {oid.replace(OID_LLDP_REM_PORT_DESC + ".", ""): val for oid, val in port_desc_data}

    for oid, sys_name in sys_name_data:
        suffix = oid.replace(OID_LLDP_REM_SYS_NAME + ".", "")
        parts = suffix.split(".")
        local_if_index = parts[1] if len(parts) > 1 else "0"

        neighbors.append(DiscoveredNeighbor(
            local_interface=local_if_index,
            remote_device_id=sys_name,
            remote_hostname=sys_name,
            remote_interface=port_desc_map.get(suffix, port_id_map.get(suffix, "")),
            protocol="lldp",
        ))

    return neighbors


async def snmp_get_vlans(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    **v3_kwargs,
) -> list[DiscoveredVlan]:
    """Get VLANs (Cisco vtpVlanTable)."""
    auth = _get_auth_data(community, version, **v3_kwargs)
    vlans = []

    name_data = await _snmp_walk(target, port, auth, OID_VLAN_NAME)
    state_data = await _snmp_walk(target, port, auth, OID_VLAN_STATE)
    state_map = {oid.replace(OID_VLAN_STATE + ".", ""): val for oid, val in state_data}

    for oid, name in name_data:
        suffix = oid.replace(OID_VLAN_NAME + ".", "")
        try:
            vlan_id = int(suffix.split(".")[-1])
        except ValueError:
            continue
        state = state_map.get(suffix, "1")
        vlans.append(DiscoveredVlan(
            vlan_id=vlan_id,
            name=name,
            status="active" if state == "1" else "inactive",
        ))

    return vlans


async def snmp_get_routes(
    target: str,
    port: int = 161,
    community: Optional[str] = None,
    version: str = "2c",
    **v3_kwargs,
) -> list[DiscoveredRoute]:
    """Get routing table via ipRouteTable."""
    auth = _get_auth_data(community, version, **v3_kwargs)
    routes = []

    dest_data = await _snmp_walk(target, port, auth, OID_IP_ROUTE_DEST)
    nh_data = await _snmp_walk(target, port, auth, OID_IP_ROUTE_NEXT_HOP)
    mask_data = await _snmp_walk(target, port, auth, OID_IP_ROUTE_MASK)
    proto_data = await _snmp_walk(target, port, auth, OID_IP_ROUTE_PROTO)
    metric_data = await _snmp_walk(target, port, auth, OID_IP_ROUTE_METRIC)
    if_data = await _snmp_walk(target, port, auth, OID_IP_ROUTE_IF_INDEX)

    nh_map = {oid.replace(OID_IP_ROUTE_NEXT_HOP + ".", ""): val for oid, val in nh_data}
    mask_map = {oid.replace(OID_IP_ROUTE_MASK + ".", ""): val for oid, val in mask_data}
    proto_map = {oid.replace(OID_IP_ROUTE_PROTO + ".", ""): val for oid, val in proto_data}
    metric_map = {oid.replace(OID_IP_ROUTE_METRIC + ".", ""): val for oid, val in metric_data}
    if_map = {oid.replace(OID_IP_ROUTE_IF_INDEX + ".", ""): val for oid, val in if_data}

    for oid, dest in dest_data:
        suffix = oid.replace(OID_IP_ROUTE_DEST + ".", "")
        mask = mask_map.get(suffix, "255.255.255.0")
        prefix_len = _mask_to_prefix(mask)
        proto_num = proto_map.get(suffix, "1")

        try:
            metric = int(metric_map.get(suffix, "0"))
        except ValueError:
            metric = 0

        routes.append(DiscoveredRoute(
            destination=dest,
            prefix_length=prefix_len,
            next_hop=nh_map.get(suffix, "0.0.0.0"),
            protocol=ROUTE_PROTO_MAP.get(proto_num, "other"),
            metric=metric,
            interface=if_map.get(suffix),
        ))

    return routes


def _mask_to_prefix(mask: str) -> int:
    """Convert subnet mask to prefix length."""
    try:
        octets = mask.split(".")
        binary = "".join(f"{int(o):08b}" for o in octets)
        return binary.count("1")
    except (ValueError, AttributeError):
        return 24
