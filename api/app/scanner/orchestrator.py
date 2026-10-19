"""Scan orchestrator — coordinates the full discovery pipeline"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Scan, Device, Interface, Link, Network, AppSettings
from app.crypto import decrypt_value
from app.notify import send_scan_notification
from app.scanner.snmp import (
    snmp_get_system,
    snmp_get_interfaces,
    snmp_get_interface_utilization,
    snmp_get_arp_table,
    snmp_get_cdp_neighbors,
    snmp_get_lldp_neighbors,
    snmp_get_vlans,
    snmp_get_routes,
)
from app.scanner.nmap_scanner import scan_subnet, mac_vendor_lookup
from app.scanner.arp_scanner import arp_scan
from app.scanner.topology import build_topology
from app.scanner.models import DiscoveredDevice, DiscoveredInterface

logger = logging.getLogger(__name__)


async def run_scan(
    db: Session,
    scan_id: int,
    target_ip: str,
    subnets: list[str],
    snmp_community: Optional[str] = None,
    snmp_version: str = "2c",
    snmp_port: int = 161,
    scan_nmap: bool = True,
    scan_arp: bool = True,
    scan_snmp: bool = True,
    **v3_kwargs,
) -> None:
    """Run the full scan pipeline:
    1. SNMP system info on target
    2. SNMP interfaces + counters
    3. SNMP ARP table
    4. SNMP CDP/LLDP neighbors
    5. SNMP routing table + VLANs
    6. nmap subnet scan
    7. ARP scan
    8. Build topology (infer links)
    9. Persist to database
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        return

    scan_mode = os.getenv("SCAN_MODE", "full")
    logger.info("Scan %d starting (mode: %s)", scan_id, scan_mode)

    scan.status = "running"
    scan.started_at = datetime.now(timezone.utc)
    db.commit()

    devices: dict[str, DiscoveredDevice] = {}
    all_interfaces: dict[str, list[DiscoveredInterface]] = {}
    cdp_neighbors = []
    lldp_neighbors = []
    arp_entries = []
    routes = []
    vlans = []

    try:
        # Phase 1: SNMP on primary target
        if scan_snmp and snmp_community:
            _update_phase(db, scan, "SNMP system discovery", 5)
            snmp_kwargs = dict(
                port=snmp_port,
                community=snmp_community,
                version=snmp_version,
                **v3_kwargs,
            )

            system = await snmp_get_system(target_ip, **snmp_kwargs)
            if system:
                devices[target_ip] = system
                logger.info("SNMP system: %s (%s)", system.sys_name, system.device_type)

                # Phase 2: Interfaces
                _update_phase(db, scan, "SNMP interface discovery", 15)
                ifaces = await snmp_get_interfaces(target_ip, **snmp_kwargs)
                if ifaces:
                    system.interfaces = ifaces
                    all_interfaces[target_ip] = ifaces

                # Phase 3: Utilization (shorter interval for scan speed)
                _update_phase(db, scan, "Measuring interface utilization", 25)
                util = await snmp_get_interface_utilization(target_ip, interval=10, **snmp_kwargs)
                for idx, (in_u, out_u) in util.items():
                    for iface in ifaces:
                        if iface.if_index == idx:
                            iface.utilization_in = in_u
                            iface.utilization_out = out_u

                # Phase 4: ARP table
                _update_phase(db, scan, "SNMP ARP table", 35)
                arp_entries = await snmp_get_arp_table(target_ip, **snmp_kwargs)

                # Phase 5: CDP/LLDP neighbors
                _update_phase(db, scan, "Neighbor discovery (CDP/LLDP)", 45)
                cdp_neighbors = await snmp_get_cdp_neighbors(target_ip, **snmp_kwargs)
                lldp_neighbors = await snmp_get_lldp_neighbors(target_ip, **snmp_kwargs)

                # Phase 6: Routes + VLANs
                _update_phase(db, scan, "Routing table and VLANs", 55)
                routes = await snmp_get_routes(target_ip, **snmp_kwargs)
                vlans = await snmp_get_vlans(target_ip, **snmp_kwargs)

        # Phase 7: nmap subnet scan
        if scan_nmap and subnets:
            _update_phase(db, scan, "nmap subnet scanning", 65)
            for subnet in subnets:
                nmap_devices = await scan_subnet(subnet)
                for dev in nmap_devices:
                    if dev.ip_address not in devices:
                        devices[dev.ip_address] = dev
                    else:
                        # Merge nmap data into existing SNMP device
                        existing = devices[dev.ip_address]
                        if not existing.os_family and dev.os_family:
                            existing.os_family = dev.os_family
                        if not existing.os_version and dev.os_version:
                            existing.os_version = dev.os_version
                        if not existing.mac_address and dev.mac_address:
                            existing.mac_address = dev.mac_address
                        if not existing.vendor and dev.vendor:
                            existing.vendor = dev.vendor
                        if existing.device_type == "unknown" and dev.device_type != "unknown":
                            existing.device_type = dev.device_type

        # Phase 8: ARP scan for L2 discovery
        if scan_arp and subnets:
            _update_phase(db, scan, "ARP scanning", 75)
            for subnet in subnets:
                arp_hosts = await arp_scan(subnet)
                for entry in arp_hosts:
                    if entry.ip_address not in devices:
                        vendor = mac_vendor_lookup(entry.mac_address)
                        devices[entry.ip_address] = DiscoveredDevice(
                            ip_address=entry.ip_address,
                            mac_address=entry.mac_address,
                            vendor=vendor,
                        )
                    elif not devices[entry.ip_address].mac_address:
                        devices[entry.ip_address].mac_address = entry.mac_address
                        if not devices[entry.ip_address].vendor:
                            devices[entry.ip_address].vendor = mac_vendor_lookup(entry.mac_address)

        # Phase 9: Build topology
        _update_phase(db, scan, "Building topology", 85)
        links, networks = build_topology(
            devices=devices,
            interfaces=all_interfaces,
            arp_entries=arp_entries,
            cdp_neighbors=cdp_neighbors,
            lldp_neighbors=lldp_neighbors,
            routes=routes,
            vlans=vlans,
            target_ip=target_ip,
        )

        # Phase 10: Persist to database
        _update_phase(db, scan, "Saving results", 90)
        _persist_results(db, scan, devices, all_interfaces, links, networks)

        scan.status = "completed"
        scan.progress = 100
        scan.phase = "Complete"
        scan.device_count = len(devices)
        scan.link_count = len(links)
        scan.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Scan %d complete: %d devices, %d links", scan_id, len(devices), len(links))
        await _maybe_notify(db, scan, "completed")

    except Exception as e:
        logger.exception("Scan %d failed: %s", scan_id, e)
        scan.status = "failed"
        scan.error_message = str(e)
        scan.completed_at = datetime.now(timezone.utc)
        db.commit()
        await _maybe_notify(db, scan, "failed")


async def _maybe_notify(db: Session, scan: Scan, event: str) -> None:
    """Fire a webhook notification for a scan event if enabled in settings.

    Best-effort: any error here is logged and swallowed so notification problems
    never mark an otherwise-good scan as failed.
    """
    try:
        settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
        if not settings or not settings.notify_enabled:
            return
        if event == "completed" and not settings.notify_on_scan_complete:
            return
        if event == "failed" and not settings.notify_on_scan_failed:
            return
        webhook_url = decrypt_value(settings.notify_webhook_url)
        if not webhook_url:
            return
        await send_scan_notification(
            webhook_url=webhook_url,
            event=event,
            scan_id=scan.id,
            target_ip=scan.target_ip,
            status=scan.status,
            device_count=scan.device_count or 0,
            link_count=scan.link_count or 0,
            error_message=scan.error_message,
        )
    except Exception as exc:  # noqa: BLE001 — notifications must never break a scan
        logger.warning("Scan %d notification dispatch error: %s", scan.id, exc)


def _update_phase(db: Session, scan: Scan, phase: str, progress: int):
    """Update scan phase and progress."""
    scan.phase = phase
    scan.progress = progress
    db.commit()
    logger.info("Scan %d: %s (%d%%)", scan.id, phase, progress)


def _persist_results(
    db: Session,
    scan: Scan,
    devices: dict[str, DiscoveredDevice],
    interfaces: dict[str, list[DiscoveredInterface]],
    links: list,
    networks: list,
):
    """Save discovered devices, interfaces, links, and networks to database."""
    device_db_map: dict[str, Device] = {}
    interface_db_map: dict[str, dict[int, Interface]] = {}

    # Auto-layout positions
    positions = _auto_layout(devices)

    for ip, dev in devices.items():
        pos = positions.get(ip, (0, 0))
        db_device = Device(
            scan_id=scan.id,
            ip_address=dev.ip_address,
            hostname=dev.hostname,
            mac_address=dev.mac_address,
            vendor=dev.vendor,
            device_type=dev.device_type,
            os_family=dev.os_family,
            os_version=dev.os_version,
            sys_name=dev.sys_name,
            sys_descr=dev.sys_descr,
            sys_object_id=dev.sys_object_id,
            sys_location=dev.sys_location,
            sys_contact=dev.sys_contact,
            uptime_seconds=dev.uptime_seconds,
            snmp_reachable=dev.snmp_reachable,
            position_x=pos[0],
            position_y=pos[1],
        )
        db.add(db_device)
        db.flush()
        device_db_map[ip] = db_device
        interface_db_map[ip] = {}

        # Persist interfaces
        for iface in dev.interfaces:
            db_iface = Interface(
                device_id=db_device.id,
                if_index=iface.if_index,
                name=iface.name,
                description=iface.description,
                ip_address=iface.ip_address,
                subnet_mask=iface.subnet_mask,
                mac_address=iface.mac_address,
                speed_mbps=iface.speed_mbps,
                mtu=iface.mtu,
                admin_status=iface.admin_status,
                oper_status=iface.oper_status,
                if_type=iface.if_type,
                vlan_id=iface.vlan_id,
                in_octets=iface.in_octets,
                out_octets=iface.out_octets,
                in_errors=iface.in_errors,
                out_errors=iface.out_errors,
                utilization_in=iface.utilization_in,
                utilization_out=iface.utilization_out,
            )
            db.add(db_iface)
            db.flush()
            interface_db_map[ip][iface.if_index] = db_iface

    # Persist links
    for link in links:
        src_dev = device_db_map.get(link.source_ip)
        tgt_dev = device_db_map.get(link.target_ip)
        if not src_dev or not tgt_dev:
            continue

        db_link = Link(
            scan_id=scan.id,
            source_device_id=src_dev.id,
            target_device_id=tgt_dev.id,
            discovery_method=link.discovery_method,
            bandwidth_mbps=link.bandwidth_mbps,
            link_type=link.link_type,
        )
        db.add(db_link)

    # Persist networks
    for net in networks:
        gw_dev = device_db_map.get(net.gateway_ip) if net.gateway_ip else None
        db_net = Network(
            scan_id=scan.id,
            network_address=net.network_address,
            prefix_length=net.prefix_length,
            vlan_id=net.vlan_id,
            vlan_name=net.vlan_name,
            gateway_ip=net.gateway_ip,
            gateway_device_id=gw_dev.id if gw_dev else None,
            device_count=net.device_count,
        )
        db.add(db_net)

    db.flush()


def _auto_layout(devices: dict[str, DiscoveredDevice]) -> dict[str, tuple[float, float]]:
    """Auto-layout devices in a hierarchical tree.

    Layer order: firewall → router → switch → wireless_ap → server → endpoint/printer/unknown
    Within each layer, devices are spread horizontally centered on x=500.
    """
    positions = {}

    # Assign layers with priority ordering
    layer_order = ["firewall", "router", "switch", "wireless_ap", "server", "endpoint", "printer", "unknown"]
    layer_y = {
        "firewall": 50,
        "router": 250,
        "switch": 450,
        "wireless_ap": 550,
        "server": 650,
        "endpoint": 850,
        "printer": 850,
        "unknown": 750,
    }

    layers: dict[str, list[str]] = {k: [] for k in layer_order}

    for ip, dev in devices.items():
        layer = dev.device_type if dev.device_type in layers else "unknown"
        layers[layer].append(ip)

    # Sort IPs within each layer for consistent ordering
    for layer_name in layers:
        layers[layer_name].sort()

    center_x = 500
    h_spacing = 280

    for layer_name in layer_order:
        ips = layers[layer_name]
        if not ips:
            continue
        y = layer_y[layer_name]
        total = len(ips)
        start_x = center_x - ((total - 1) * h_spacing) / 2
        for i, ip in enumerate(ips):
            positions[ip] = (start_x + i * h_spacing, y)

    return positions
