"""Scan comparison / diff routes"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Scan, Device, Link
from app.schemas import ScanDiffResponse, DeviceChange, LinkChange

router = APIRouter()


@router.get("/{scan_id_a}/compare/{scan_id_b}", response_model=ScanDiffResponse)
async def compare_scans(
    scan_id_a: int,
    scan_id_b: int,
    db: Session = Depends(get_db),
):
    """Compare two completed scans to visualize network changes."""
    scan_a = db.query(Scan).filter(Scan.id == scan_id_a).first()
    scan_b = db.query(Scan).filter(Scan.id == scan_id_b).first()

    if not scan_a or not scan_b:
        raise HTTPException(status_code=404, detail="One or both scans not found")

    if scan_a.status != "completed" or scan_b.status != "completed":
        raise HTTPException(status_code=400, detail="Both scans must be completed")

    # Load devices keyed by IP
    devices_a = {d.ip_address: d for d in db.query(Device).filter(Device.scan_id == scan_id_a).all()}
    devices_b = {d.ip_address: d for d in db.query(Device).filter(Device.scan_id == scan_id_b).all()}

    ips_a = set(devices_a.keys())
    ips_b = set(devices_b.keys())

    added = []
    removed = []
    changed = []
    unchanged_count = 0

    # Added: in B but not in A
    for ip in ips_b - ips_a:
        d = devices_b[ip]
        added.append(DeviceChange(
            ip_address=ip,
            hostname=d.hostname,
            device_type=d.device_type,
            vendor=d.vendor,
            change_type="added",
        ))

    # Removed: in A but not in B
    for ip in ips_a - ips_b:
        d = devices_a[ip]
        removed.append(DeviceChange(
            ip_address=ip,
            hostname=d.hostname,
            device_type=d.device_type,
            vendor=d.vendor,
            change_type="removed",
        ))

    # Changed / unchanged: in both
    for ip in ips_a & ips_b:
        da = devices_a[ip]
        db_dev = devices_b[ip]
        changes = {}

        if da.device_type != db_dev.device_type:
            changes["device_type"] = {"from": da.device_type, "to": db_dev.device_type}
        if da.vendor != db_dev.vendor:
            changes["vendor"] = {"from": da.vendor, "to": db_dev.vendor}
        if da.hostname != db_dev.hostname:
            changes["hostname"] = {"from": da.hostname, "to": db_dev.hostname}

        if changes:
            changed.append(DeviceChange(
                ip_address=ip,
                hostname=db_dev.hostname,
                device_type=db_dev.device_type,
                vendor=db_dev.vendor,
                change_type="changed",
                changes=changes,
            ))
        else:
            unchanged_count += 1

    # Links comparison — key by sorted (source_ip, target_ip) tuple
    links_a_raw = db.query(Link).filter(Link.scan_id == scan_id_a).all()
    links_b_raw = db.query(Link).filter(Link.scan_id == scan_id_b).all()

    def link_key(link: Link, device_map: dict) -> tuple[str, str] | None:
        src = device_map.get(link.source_device_id)
        tgt = device_map.get(link.target_device_id)
        if not src or not tgt:
            return None
        return tuple(sorted([src, tgt]))

    # Build device_id -> ip maps
    dev_id_to_ip_a = {d.id: d.ip_address for d in devices_a.values()}
    dev_id_to_ip_b = {d.id: d.ip_address for d in devices_b.values()}

    links_a_map = {}
    for link in links_a_raw:
        key = link_key(link, dev_id_to_ip_a)
        if key:
            links_a_map[key] = link

    links_b_map = {}
    for link in links_b_raw:
        key = link_key(link, dev_id_to_ip_b)
        if key:
            links_b_map[key] = link

    keys_a = set(links_a_map.keys())
    keys_b = set(links_b_map.keys())

    links_added = []
    links_removed = []
    links_changed = []
    links_unchanged = 0

    for key in keys_b - keys_a:
        link = links_b_map[key]
        links_added.append(LinkChange(
            source_ip=key[0],
            target_ip=key[1],
            discovery_method=link.discovery_method,
            change_type="added",
        ))

    for key in keys_a - keys_b:
        link = links_a_map[key]
        links_removed.append(LinkChange(
            source_ip=key[0],
            target_ip=key[1],
            discovery_method=link.discovery_method,
            change_type="removed",
        ))

    for key in keys_a & keys_b:
        la = links_a_map[key]
        lb = links_b_map[key]
        if la.discovery_method != lb.discovery_method or la.bandwidth_mbps != lb.bandwidth_mbps:
            links_changed.append(LinkChange(
                source_ip=key[0],
                target_ip=key[1],
                discovery_method=lb.discovery_method,
                change_type="changed",
            ))
        else:
            links_unchanged += 1

    return ScanDiffResponse(
        scan_a_id=scan_id_a,
        scan_b_id=scan_id_b,
        devices_added=added,
        devices_removed=removed,
        devices_changed=changed,
        devices_unchanged=unchanged_count,
        links_added=links_added,
        links_removed=links_removed,
        links_changed=links_changed,
        links_unchanged=links_unchanged,
    )
