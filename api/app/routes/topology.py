"""Topology routes — get topology data and update positions"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Scan, Device, Link, Network
from app.schemas import TopologyResponse, PositionUpdateRequest

router = APIRouter()


@router.get("/{scan_id}/topology", response_model=TopologyResponse)
async def get_topology(
    scan_id: int,
    db: Session = Depends(get_db),
):
    """Get full topology data for a scan (devices, links, networks)."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != "completed":
        raise HTTPException(status_code=400, detail=f"Scan not complete (status: {scan.status})")

    # Eager-load interfaces with devices to avoid N+1 queries
    devices = (
        db.query(Device)
        .options(selectinload(Device.interfaces))
        .filter(Device.scan_id == scan_id)
        .all()
    )
    links = db.query(Link).filter(Link.scan_id == scan_id).all()
    networks = db.query(Network).filter(Network.scan_id == scan_id).all()

    # Count device types for stats
    type_counts = {}
    for d in devices:
        type_counts[d.device_type] = type_counts.get(d.device_type, 0) + 1

    stats = {
        "device_count": len(devices),
        "link_count": len(links),
        "network_count": len(networks),
        "device_types": type_counts,
    }

    return TopologyResponse(
        scan_id=scan_id,
        devices=devices,
        links=links,
        networks=networks,
        stats=stats,
    )


@router.put("/{scan_id}/positions")
async def update_positions(
    scan_id: int,
    request: PositionUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update device and subnet node positions on the topology canvas."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    for pos in request.networks:
        network = db.query(Network).filter(
            Network.id == pos.network_id,
            Network.scan_id == scan_id,
        ).first()
        if network:
            network.position_x = pos.x
            network.position_y = pos.y

    for pos in request.positions:
        device = db.query(Device).filter(
            Device.id == pos.device_id,
            Device.scan_id == scan_id,
        ).first()
        if device:
            device.position_x = pos.x
            device.position_y = pos.y

    db.commit()
    return {"updated": len(request.positions) + len(request.networks)}
