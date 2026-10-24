"""Draw.io (diagrams.net) XML exporter with Cisco network shapes"""

import html
import xml.etree.ElementTree as ET
from typing import Optional

from app.models import Device, Link, Interface

# Cisco/network shape styles for draw.io
# Using mxGraph Cisco stencil shapes
DEVICE_STYLES = {
    "firewall": (
        "shape=mxgraph.cisco.firewalls.firewall;"
        "sketch=0;fillColor=#DA4D1F;fontColor=#FFFFFF;strokeColor=#C73500;"
    ),
    "router": (
        "shape=mxgraph.cisco.routers.router;"
        "sketch=0;fillColor=#036897;fontColor=#FFFFFF;strokeColor=#006EAF;"
    ),
    "switch": (
        "shape=mxgraph.cisco.switches.workgroup_switch;"
        "sketch=0;fillColor=#036897;fontColor=#FFFFFF;strokeColor=#006EAF;"
    ),
    "server": (
        "shape=mxgraph.cisco.servers.standard_server;"
        "sketch=0;fillColor=#585858;fontColor=#FFFFFF;strokeColor=#333333;"
    ),
    "endpoint": (
        "shape=mxgraph.cisco.computers_and_peripherals.pc;"
        "sketch=0;fillColor=#585858;fontColor=#FFFFFF;strokeColor=#333333;"
    ),
    "printer": (
        "shape=mxgraph.cisco.computers_and_peripherals.printer;"
        "sketch=0;fillColor=#585858;fontColor=#FFFFFF;strokeColor=#333333;"
    ),
    "wireless_ap": (
        "shape=mxgraph.cisco.wireless.wireless_bridge;"
        "sketch=0;fillColor=#036897;fontColor=#FFFFFF;strokeColor=#006EAF;"
    ),
    "media": (
        "shape=mxgraph.cisco.misc.generic_appliance;"
        "sketch=0;fillColor=#9D174D;fontColor=#FFFFFF;strokeColor=#831843;"
    ),
    "unknown": (
        "shape=mxgraph.cisco.misc.generic_appliance;"
        "sketch=0;fillColor=#585858;fontColor=#FFFFFF;strokeColor=#333333;"
    ),
}

# Link stroke width based on bandwidth
BANDWIDTH_STROKE = {
    100: 1,      # 100 Mbps
    1000: 2,     # 1 Gbps
    10000: 3,    # 10 Gbps
    25000: 4,    # 25 Gbps
    40000: 5,    # 40 Gbps
    100000: 6,   # 100 Gbps
}


def _get_stroke_width(bandwidth_mbps: int) -> int:
    """Get stroke width proportional to bandwidth."""
    if not bandwidth_mbps:
        return 1
    for threshold, width in sorted(BANDWIDTH_STROKE.items()):
        if bandwidth_mbps <= threshold:
            return width
    return 6


def _format_speed(speed_mbps: int) -> str:
    """Format speed in human-readable form."""
    if not speed_mbps:
        return ""
    if speed_mbps >= 1000:
        return f"{speed_mbps // 1000}G"
    return f"{speed_mbps}M"


def _build_device_label(device: Device, interfaces: list[Interface]) -> str:
    """Build multi-line label for a device node."""
    lines = []

    # Device name — HTML-escape to prevent XSS in draw.io
    name = html.escape(device.sys_name or device.hostname or device.ip_address)
    lines.append(name)

    # IP address (if different from name)
    if name != html.escape(device.ip_address):
        lines.append(html.escape(device.ip_address))

    # Device type + vendor
    type_label = html.escape(device.device_type.replace("_", " ").title())
    if device.vendor:
        lines.append(f"{type_label} ({html.escape(device.vendor)})")
    else:
        lines.append(type_label)

    return "\n".join(lines)


def _build_interface_label(iface: Interface) -> str:
    """Build interface label for link annotation."""
    parts = []
    if iface.name:
        parts.append(iface.name)
    if iface.ip_address:
        parts.append(iface.ip_address)
    if iface.speed_mbps:
        parts.append(_format_speed(iface.speed_mbps))
    if iface.utilization_in is not None and iface.utilization_in > 0:
        parts.append(f"In:{iface.utilization_in:.1f}%")
    if iface.utilization_out is not None and iface.utilization_out > 0:
        parts.append(f"Out:{iface.utilization_out:.1f}%")
    if iface.vlan_id:
        parts.append(f"VLAN {iface.vlan_id}")
    return " | ".join(parts)


def generate_drawio(
    devices: list[Device],
    links: list[Link],
    device_interfaces: dict[int, list[Interface]],
) -> str:
    """Generate draw.io XML with Cisco shapes, bandwidth-weighted links, and interface labels.

    Args:
        devices: List of Device ORM objects
        links: List of Link ORM objects
        device_interfaces: {device_id: [Interface, ...]}

    Returns:
        draw.io XML string
    """
    # Build XML structure
    mxfile = ET.Element("mxfile", {
        "host": "netmap",
        "type": "device",
    })
    diagram = ET.SubElement(mxfile, "diagram", {
        "id": "netmap-topology",
        "name": "Network Topology",
    })
    mx_graph_model = ET.SubElement(diagram, "mxGraphModel", {
        "dx": "1200",
        "dy": "800",
        "grid": "1",
        "gridSize": "10",
        "guides": "1",
        "tooltips": "1",
        "connect": "1",
        "arrows": "1",
        "fold": "1",
        "page": "1",
        "pageScale": "1",
        "math": "0",
    })
    root = ET.SubElement(mx_graph_model, "root")

    # Required root cells
    ET.SubElement(root, "mxCell", {"id": "0"})
    ET.SubElement(root, "mxCell", {"id": "1", "parent": "0"})

    device_id_map: dict[int, str] = {}

    # Create device nodes
    for device in devices:
        cell_id = f"device-{device.id}"
        device_id_map[device.id] = cell_id

        label = _build_device_label(device, device_interfaces.get(device.id, []))
        style = DEVICE_STYLES.get(device.device_type, DEVICE_STYLES["unknown"])

        x = device.position_x or 0
        y = device.position_y or 0
        width = 80
        height = 80

        cell = ET.SubElement(root, "mxCell", {
            "id": cell_id,
            "value": label,
            "style": style,
            "vertex": "1",
            "parent": "1",
        })
        ET.SubElement(cell, "mxGeometry", {
            "x": str(int(x)),
            "y": str(int(y)),
            "width": str(width),
            "height": str(height),
            "as": "geometry",
        })

    # Create link edges
    for link in links:
        src_id = device_id_map.get(link.source_device_id)
        tgt_id = device_id_map.get(link.target_device_id)
        if not src_id or not tgt_id:
            continue

        edge_id = f"link-{link.id}"
        stroke_width = _get_stroke_width(link.bandwidth_mbps or 0)

        # Build edge label from interface data
        label_parts = []
        if link.source_interface_id:
            src_ifaces = device_interfaces.get(link.source_device_id, [])
            for iface in src_ifaces:
                if iface.id == link.source_interface_id:
                    label_parts.append(_build_interface_label(iface))
                    break

        if link.bandwidth_mbps:
            label_parts.append(_format_speed(link.bandwidth_mbps))

        label = "\n".join(label_parts) if label_parts else ""

        # Link color based on type
        stroke_color = "#666666"
        if link.discovery_method == "cdp" or link.discovery_method == "lldp":
            stroke_color = "#036897"
        elif link.discovery_method == "routing":
            stroke_color = "#DA4D1F"

        style = (
            f"edgeStyle=orthogonalEdgeStyle;rounded=1;"
            f"strokeWidth={stroke_width};strokeColor={stroke_color};"
            f"fontColor=#999999;fontSize=9;"
        )

        edge = ET.SubElement(root, "mxCell", {
            "id": edge_id,
            "value": label,
            "style": style,
            "edge": "1",
            "parent": "1",
            "source": src_id,
            "target": tgt_id,
        })
        ET.SubElement(edge, "mxGeometry", {
            "relative": "1",
            "as": "geometry",
        })

    # Generate XML string
    return ET.tostring(mxfile, encoding="unicode", xml_declaration=True)
