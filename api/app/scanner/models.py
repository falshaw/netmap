"""Pydantic models for scanner discovery results"""

from pydantic import BaseModel
from typing import Optional


class DiscoveredInterface(BaseModel):
    if_index: int
    name: str = ""
    description: str = ""
    ip_address: Optional[str] = None
    subnet_mask: Optional[str] = None
    mac_address: Optional[str] = None
    speed_mbps: int = 0
    mtu: int = 0
    admin_status: str = "unknown"
    oper_status: str = "unknown"
    if_type: str = "other"
    vlan_id: Optional[int] = None
    in_octets: int = 0
    out_octets: int = 0
    in_errors: int = 0
    out_errors: int = 0
    utilization_in: float = 0.0
    utilization_out: float = 0.0


class DiscoveredDevice(BaseModel):
    ip_address: str
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    vendor: Optional[str] = None
    device_type: str = "unknown"
    os_family: Optional[str] = None
    os_version: Optional[str] = None
    sys_name: Optional[str] = None
    sys_descr: Optional[str] = None
    sys_object_id: Optional[str] = None
    sys_location: Optional[str] = None
    sys_contact: Optional[str] = None
    uptime_seconds: Optional[int] = None
    snmp_reachable: bool = False
    interfaces: list[DiscoveredInterface] = []


class DiscoveredNeighbor(BaseModel):
    local_interface: str
    remote_device_id: str
    remote_hostname: Optional[str] = None
    remote_ip: Optional[str] = None
    remote_interface: str = ""
    remote_platform: Optional[str] = None
    protocol: str = "cdp"


class DiscoveredRoute(BaseModel):
    destination: str
    prefix_length: int
    next_hop: str
    protocol: str = "unknown"
    metric: int = 0
    interface: Optional[str] = None


class DiscoveredVlan(BaseModel):
    vlan_id: int
    name: str = ""
    status: str = "active"


class ArpEntry(BaseModel):
    ip_address: str
    mac_address: str
    interface: Optional[str] = None
    vlan_id: Optional[int] = None


class DiscoveredLink(BaseModel):
    source_ip: str
    target_ip: str
    source_interface: Optional[str] = None
    target_interface: Optional[str] = None
    discovery_method: str = "arp"
    bandwidth_mbps: int = 0
    link_type: str = "ethernet"


class DiscoveredNetwork(BaseModel):
    network_address: str
    prefix_length: int
    vlan_id: Optional[int] = None
    vlan_name: Optional[str] = None
    gateway_ip: Optional[str] = None
    device_count: int = 0
