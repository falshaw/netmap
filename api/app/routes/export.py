"""Export routes — draw.io and other formats"""

from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Scan, Device, Link, Interface
from app.exporters.drawio import generate_drawio

router = APIRouter()


@router.get("/{scan_id}/export/drawio")
async def export_drawio(
    scan_id: int,
    db: Session = Depends(get_db),
):
    """Export scan topology as draw.io XML file."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status != "completed":
        raise HTTPException(status_code=400, detail=f"Scan not complete (status: {scan.status})")

    devices = db.query(Device).filter(Device.scan_id == scan_id).all()
    links = db.query(Link).filter(Link.scan_id == scan_id).all()

    # Batch-load all interfaces for devices in this scan (single query, not N+1)
    device_ids = [d.id for d in devices]
    all_interfaces = (
        db.query(Interface)
        .filter(Interface.device_id.in_(device_ids))
        .all()
    ) if device_ids else []
    device_interfaces: dict[int, list[Interface]] = defaultdict(list)
    for iface in all_interfaces:
        device_interfaces[iface.device_id].append(iface)

    xml_content = generate_drawio(devices, links, dict(device_interfaces))

    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={
            "Content-Disposition": f"attachment; filename=netmap-scan-{scan_id}.drawio",
        },
    )
