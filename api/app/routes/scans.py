"""Scan management routes"""

import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, selectinload

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models import Scan, Device, AppSettings
from app.schemas import ScanRequest, ScanResponse, DeviceResponse
from app.scanner.orchestrator import run_scan
from app.crypto import decrypt_value
from app.rate_limit import limiter

router = APIRouter()


@router.post("", response_model=ScanResponse, status_code=201)
@limiter.limit("5/minute")
async def create_scan(
    request: Request,
    scan_req: ScanRequest,
    db: Session = Depends(get_db),
):
    """Start a new network scan. Falls back to AppSettings defaults."""
    # Load defaults from settings if not specified in request
    settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if settings:
        if scan_req.snmp_community is None:
            scan_req.snmp_community = decrypt_value(settings.snmp_community)
        if scan_req.snmp_version == "2c" and settings.snmp_version != "2c":
            scan_req.snmp_version = settings.snmp_version

    scan = Scan(
        target_ip=scan_req.target_ip,
        subnets=scan_req.subnets or [],
        status="pending",
        progress=0,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # Run scan in background
    # We need a new db session for the background task
    from app.database import SessionLocal

    async def _run():
        bg_db = SessionLocal()
        try:
            await asyncio.wait_for(
                run_scan(
                    db=bg_db,
                    scan_id=scan.id,
                    target_ip=scan_req.target_ip,
                    subnets=scan_req.subnets or [],
                    snmp_community=scan_req.snmp_community,
                    snmp_version=scan_req.snmp_version,
                    snmp_port=scan_req.snmp_port,
                    scan_nmap=scan_req.scan_nmap,
                    scan_arp=scan_req.scan_arp,
                    scan_snmp=scan_req.scan_snmp,
                ),
                timeout=600,  # 10 minute max scan duration
            )
        except asyncio.TimeoutError:
            s = bg_db.query(Scan).filter(Scan.id == scan.id).first()
            if s and s.status == "running":
                s.status = "failed"
                s.error_message = "Scan timed out after 10 minutes"
                bg_db.commit()
        finally:
            bg_db.close()

    # Schedule as asyncio task (keep reference to prevent GC)
    task = asyncio.create_task(_run())
    task.add_done_callback(
        lambda t: logger.error("Scan task failed: %s", t.exception())
        if not t.cancelled() and t.exception() else None
    )

    return scan


@router.get("", response_model=list[ScanResponse])
async def list_scans(
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List recent scans."""
    scans = db.query(Scan).order_by(Scan.created_at.desc()).limit(limit).all()
    return scans


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: int,
    db: Session = Depends(get_db),
):
    """Get scan status and details."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.delete("/{scan_id}", status_code=204)
async def delete_scan(
    scan_id: int,
    db: Session = Depends(get_db),
):
    """Delete a scan and all its associated data (cascading)."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status == "running":
        raise HTTPException(status_code=409, detail="Cannot delete a running scan")
    db.delete(scan)
    db.commit()
    return None


@router.get("/{scan_id}/devices", response_model=list[DeviceResponse])
async def get_scan_devices(
    scan_id: int,
    db: Session = Depends(get_db),
):
    """Get all devices discovered in a scan."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    # Eager-load interfaces to avoid N+1 when serializing DeviceResponse
    devices = (
        db.query(Device)
        .options(selectinload(Device.interfaces))
        .filter(Device.scan_id == scan_id)
        .all()
    )
    return devices
