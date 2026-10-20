"""Topology builder — infers links from discovery data"""

import ipaddress
import logging
from typing import Optional

from app.scanner.models import (
    DiscoveredDevice,
    DiscoveredInterface,
    DiscoveredNeighbor,
    DiscoveredRoute,
    DiscoveredVlan,
    ArpEntry,
    DiscoveredLink,
    DiscoveredNetwork,
)

logger = logging.getLogger(__name__)


def build_topology(
    devices: dict[str, DiscoveredDevice],
    interfaces: dict[str, list[DiscoveredInterface]],
    arp_entries: list[ArpEntry],
    cdp_neighbors: list[DiscoveredNeighbor],
    lldp_neighbors: list[DiscoveredNeighbor],
    routes: list[DiscoveredRoute],
    vlans: list[DiscoveredVlan],
    target_ip: str,
    subnets: Optional[list[str]] = None,
) -> tuple[list[DiscoveredLink], list[DiscoveredNetwork]]:
    """Build topology by inferring links from multiple data sources.

    Link inference priority:
    1. CDP/LLDP — explicit neighbor relationships (most reliable)
    2. ARP — devices on same L2 segment
    3. Routing — next-hop relationships
    4. Subnet — devices sharing an IP subnet

    ``subnets`` are the subnets that were scanned. Each one that contains at
    least one discovered device becomes a network (a subnet is a network node,
    never a device); devices without SNMP interface data are grouped into the
    scanned subnet that contains them instead of a guessed /24.

    Returns (links, networks).
    """
    links: list[DiscoveredLink] = []
    seen_links: set[tuple[str, str]] = set()
    discovered_networks: list[DiscoveredNetwork] = []

    def _add_link(src: str, dst: str, method: str, bandwidth: int = 0, link_type: str = "ethernet",
                  src_iface: Optional[str] = None, dst_iface: Optional[str] = None):
        """Add link if not duplicate (bidirectional check)."""
        if src == dst:
            return
        key = tuple(sorted([src, dst]))
        if key in seen_links:
            return
        if src not in devices or dst not in devices:
            return
        seen_links.add(key)
        links.append(DiscoveredLink(
            source_ip=src,
            target_ip=dst,
            source_interface=src_iface,
            target_interface=dst_iface,
            discovery_method=method,
            bandwidth_mbps=bandwidth,
            link_type=link_type,
        ))

    # 1. CDP neighbors — explicit link relationships
    for neighbor in cdp_neighbors:
        remote_ip = neighbor.remote_ip
        if not remote_ip:
            # Try to resolve by hostname
            for ip, dev in devices.items():
                if dev.hostname and dev.hostname == neighbor.remote_hostname:
                    remote_ip = ip
                    break
        if remote_ip:
            _add_link(
                target_ip, remote_ip, "cdp",
                src_iface=neighbor.local_interface,
                dst_iface=neighbor.remote_interface,
            )

    # 2. LLDP neighbors
    for neighbor in lldp_neighbors:
        remote_ip = neighbor.remote_ip
        if not remote_ip:
            for ip, dev in devices.items():
                if dev.hostname and dev.hostname == neighbor.remote_hostname:
                    remote_ip = ip
                    break
                if dev.sys_name and dev.sys_name == neighbor.remote_hostname:
                    remote_ip = ip
                    break
        if remote_ip:
            _add_link(
                target_ip, remote_ip, "lldp",
                src_iface=neighbor.local_interface,
                dst_iface=neighbor.remote_interface,
            )

    # 3. ARP table — devices reachable at L2 from target
    for entry in arp_entries:
        if entry.ip_address in devices:
            _add_link(
                target_ip, entry.ip_address, "arp",
                src_iface=entry.interface,
            )

    # 4. Routing — next-hop connections
    for route in routes:
        if route.next_hop and route.next_hop != "0.0.0.0" and route.next_hop in devices:
            _add_link(target_ip, route.next_hop, "routing")

    # 5. Subnet inference — group devices by subnet, link to hub
    subnet_groups = _group_by_subnet(devices, interfaces, subnets)
    scanned = {str(n) for n in _parse_networks(subnets)}
    for subnet_str, members in subnet_groups.items():
        if len(members) < 2 and subnet_str not in scanned:
            continue

        # Find hub: prefer firewall/router, then target_ip, then first device
        hub_ip = None
        for ip in members:
            if devices[ip].device_type in ("firewall", "router"):
                hub_ip = ip
                break
        if not hub_ip and target_ip in members:
            hub_ip = target_ip
        if not hub_ip:
            hub_ip = members[0]

        for ip in members:
            if ip != hub_ip:
                _add_link(hub_ip, ip, "subnet")

        # Build network entry
        try:
            net = ipaddress.ip_network(subnet_str, strict=False)
            vlan_id = None
            vlan_name = None
            for v in vlans:
                # Match VLAN to subnet by checking interface VLAN tags
                for ip in members:
                    for iface in interfaces.get(ip, []):
                        if iface.vlan_id == v.vlan_id:
                            vlan_id = v.vlan_id
                            vlan_name = v.name
                            break

            discovered_networks.append(DiscoveredNetwork(
                network_address=str(net.network_address),
                prefix_length=net.prefixlen,
                vlan_id=vlan_id,
                vlan_name=vlan_name,
                # Only a routing device is reported as the subnet's gateway;
                # a plain host used as the link hub is not.
                gateway_ip=hub_ip if devices[hub_ip].device_type in ("firewall", "router") else None,
                device_count=len(members),
            ))
        except ValueError:
            pass

    # Determine link bandwidth from interface speeds
    for link in links:
        if link.bandwidth_mbps > 0:
            continue
        src_ifaces = interfaces.get(link.source_ip, [])
        for iface in src_ifaces:
            if link.source_interface and str(iface.if_index) == link.source_interface:
                link.bandwidth_mbps = iface.speed_mbps
                break
        if link.bandwidth_mbps == 0:
            # Use the highest speed interface as default
            if src_ifaces:
                link.bandwidth_mbps = max(i.speed_mbps for i in src_ifaces) if src_ifaces else 0

    logger.info("Topology: %d links, %d networks from %d devices", len(links), len(discovered_networks), len(devices))
    return links, discovered_networks


def _group_by_subnet(
    devices: dict[str, DiscoveredDevice],
    interfaces: dict[str, list[DiscoveredInterface]],
    subnets: Optional[list[str]] = None,
) -> dict[str, list[str]]:
    """Group device IPs by their subnet (from interface data, then scanned subnets)."""
    subnet_groups: dict[str, list[str]] = {}
    scanned = _parse_networks(subnets)
    # Most specific scanned subnet wins when they overlap.
    scanned.sort(key=lambda n: n.prefixlen, reverse=True)

    for ip, ifaces in interfaces.items():
        for iface in ifaces:
            if not iface.ip_address or not iface.subnet_mask:
                continue
            try:
                network = ipaddress.ip_network(
                    f"{iface.ip_address}/{iface.subnet_mask}", strict=False
                )
                key = str(network)
                subnet_groups.setdefault(key, [])
                if ip not in subnet_groups[key]:
                    subnet_groups[key].append(ip)
            except ValueError:
                continue

    # Devices without interface data: the scanned subnet that contains them,
    # falling back to their /24.
    for ip in devices:
        if ip in interfaces:
            continue
        try:
            addr = ipaddress.ip_address(ip)
            net = next((n for n in scanned if addr in n), None)
            if net is None:
                net = ipaddress.ip_network(f"{ip}/24", strict=False)
            key = str(net)
            subnet_groups.setdefault(key, [])
            if ip not in subnet_groups[key]:
                subnet_groups[key].append(ip)
        except ValueError:
            continue

    return subnet_groups


def _parse_networks(subnets: Optional[list[str]]) -> list:
    """Parse CIDR strings, silently skipping invalid ones."""
    nets = []
    for s in subnets or []:
        try:
            nets.append(ipaddress.ip_network(s, strict=False))
        except ValueError:
            continue
    return nets
