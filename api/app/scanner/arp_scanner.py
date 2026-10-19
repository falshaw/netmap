"""ARP-based L2 discovery using scapy"""

import logging
from typing import Optional
from app.scanner.models import ArpEntry
from app.scanner.nmap_scanner import mac_vendor_lookup

logger = logging.getLogger(__name__)


async def arp_scan(subnet: str, timeout: int = 3) -> list[ArpEntry]:
    """Send ARP requests to discover live hosts on a subnet.

    Args:
        subnet: CIDR notation (e.g., "192.168.1.0/24")
        timeout: Seconds to wait for replies
    """
    import os
    import asyncio

    if os.getenv("SCAN_MODE") == "limited":
        logger.warning("ARP scan skipped: SCAN_MODE=limited (no raw sockets in bridge mode)")
        return []

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _arp_scan_sync, subnet, timeout)


def _arp_scan_sync(subnet: str, timeout: int) -> list[ArpEntry]:
    """Synchronous ARP scan (runs in thread pool)."""
    try:
        from scapy.all import ARP, Ether, srp, conf
        conf.verb = 0

        arp_request = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=subnet)
        answered, _ = srp(arp_request, timeout=timeout, verbose=False)

        entries = []
        for _, received in answered:
            entries.append(ArpEntry(
                ip_address=received.psrc,
                mac_address=received.hwsrc,
            ))

        logger.info("ARP scan found %d hosts in %s", len(entries), subnet)
        return entries

    except PermissionError:
        logger.warning("ARP scan requires root/NET_RAW capability")
        return []
    except ImportError:
        logger.warning("scapy not available, skipping ARP scan")
        return []
    except Exception as e:
        logger.error("ARP scan failed: %s", e)
        return []
