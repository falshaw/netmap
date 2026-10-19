"""Aggregated statistics routes"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Scan, Device

router = APIRouter()


@router.get("")
async def get_stats(db: Session = Depends(get_db)):
    """Get aggregated stats across all completed scans."""
    total_scans = db.query(func.count(Scan.id)).filter(Scan.status == "completed").scalar() or 0

    # Count unique devices from latest completed scan only (avoids double-counting across scans)
    latest_scan = (
        db.query(Scan)
        .filter(Scan.status == "completed")
        .order_by(Scan.completed_at.desc())
        .first()
    )
    total_devices = (
        db.query(func.count(Device.id)).filter(Device.scan_id == latest_scan.id).scalar()
        if latest_scan else 0
    ) or 0

    device_types: dict[str, int] = {}
    if latest_scan:
        rows = (
            db.query(Device.device_type, func.count(Device.id))
            .filter(Device.scan_id == latest_scan.id)
            .group_by(Device.device_type)
            .all()
        )
        device_types = {row[0]: row[1] for row in rows}

    return {
        "total_scans": total_scans,
        "total_devices": total_devices,
        "device_types": device_types,
    }
