import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import DeviceNode, { DEVICE_NODE_WIDTH } from "./DeviceNode";
import NetworkNode, { NETWORK_NODE_WIDTH } from "./NetworkNode";
import DevicePanel from "./DevicePanel";
import type {
  TopologyData,
  DeviceData,
  NetworkData,
} from "../../services/api";
import { api } from "../../services/api";

const nodeTypes = { device: DeviceNode, network: NetworkNode };

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inNetwork(ip: string, net: NetworkData): boolean {
  const addr = ipToInt(ip);
  const base = ipToInt(net.network_address);
  if (addr === null || base === null) return false;
  const bits = net.prefix_length;
  if (bits <= 0) return true;
  const mask = bits >= 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return ((addr & mask) >>> 0) === ((base & mask) >>> 0);
}

/** Device id -> the most specific network that contains it. */
function assignNetworks(
  devices: DeviceData[],
  networks: NetworkData[],
): Map<number, NetworkData> {
  const byPrefix = [...networks].sort((a, b) => b.prefix_length - a.prefix_length);
  const out = new Map<number, NetworkData>();
  for (const d of devices) {
    const net = byPrefix.find((n) => inNetwork(d.ip_address, n));
    if (net) out.set(d.id, net);
  }
  return out;
}

const NETWORK_GAP_Y = 150;

const STROKE_WIDTH_MAP: Record<string, number> = {
  "100": 1,
  "1000": 2,
  "10000": 3,
  "25000": 4,
  "40000": 5,
  "100000": 6,
};

function getStrokeWidth(bandwidth: number | null): number {
  if (!bandwidth) return 1;
  for (const [threshold, width] of Object.entries(STROKE_WIDTH_MAP)) {
    if (bandwidth <= parseInt(threshold)) return width;
  }
  return 6;
}

function getEdgeColor(method: string | null): string {
  switch (method) {
    case "cdp":
    case "lldp":
      return "#06b6d4";
    case "routing":
      return "#c9a227";
    case "arp":
      return "#22c55e";
    default:
      return "#444444";
  }
}

function formatBandwidth(mbps: number): string {
  return mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`;
}

function formatMethod(method: string | null): string {
  if (!method) return "";
  return method.toUpperCase();
}

const DISCOVERY_LEGEND = [
  { method: "CDP/LLDP", color: "#06b6d4" },
  { method: "Routing", color: "#c9a227" },
  { method: "ARP", color: "#22c55e" },
  { method: "Subnet", color: "#8b5cf6" },
];

interface TopologyCanvasProps {
  data: TopologyData;
  searchQuery?: string;
  activeFilters?: Set<string>;
}

export default function TopologyCanvas({
  data,
  searchQuery,
  activeFilters,
}: TopologyCanvasProps) {
  const [selectedDevice, setSelectedDevice] = useState<DeviceData | null>(null);

  // Debounce search query and filter changes by 100ms to avoid expensive
  // re-calculations on every keystroke / rapid filter toggles.
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [debouncedFilters, setDebouncedFilters] = useState(activeFilters);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setDebouncedFilters(activeFilters);
    }, 100);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery, activeFilters]);

  const matchesSearch = useCallback(
    (device: DeviceData): boolean => {
      // Type filter
      if (debouncedFilters && debouncedFilters.size > 0) {
        if (!debouncedFilters.has(device.device_type)) return false;
      }
      // Text search
      if (!debouncedQuery || debouncedQuery.trim() === "") return true;
      const q = debouncedQuery.toLowerCase();
      return (
        device.ip_address.toLowerCase().includes(q) ||
        (device.hostname?.toLowerCase().includes(q) ?? false) ||
        (device.sys_name?.toLowerCase().includes(q) ?? false) ||
        (device.vendor?.toLowerCase().includes(q) ?? false) ||
        device.device_type.toLowerCase().includes(q)
      );
    },
    [debouncedQuery, debouncedFilters],
  );

  const hasActiveSearch =
    (debouncedQuery && debouncedQuery.trim() !== "") ||
    (debouncedFilters && debouncedFilters.size > 0);

  const matchedDeviceIds = useMemo(() => {
    if (!hasActiveSearch) return null;
    const ids = new Set<number>();
    for (const device of data.devices) {
      if (matchesSearch(device)) ids.add(device.id);
    }
    return ids;
  }, [data.devices, hasActiveSearch, matchesSearch]);

  const membership = useMemo(
    () => assignNetworks(data.devices, data.networks),
    [data.devices, data.networks],
  );

  // Subnets are drawn as their own nodes: gateway above, hosts below.
  const networkNodes: Node[] = useMemo(() => {
    const out: Node[] = [];
    for (const net of data.networks) {
      const members = data.devices.filter((d) => membership.get(d.id) === net);
      if (members.length === 0) continue;
      const gateway = members.find((d) => d.ip_address === net.gateway_ip);
      const hosts = members.filter((d) => d !== gateway);
      const xs = (hosts.length ? hosts : members).map((d) => d.position_x ?? 0);
      const centre = (Math.min(...xs) + Math.max(...xs)) / 2 + DEVICE_NODE_WIDTH / 2;
      const y = gateway
        ? (gateway.position_y ?? 0) + NETWORK_GAP_Y
        : Math.min(...hosts.map((d) => d.position_y ?? 0)) - NETWORK_GAP_Y;
      out.push({
        id: `network-${net.id}`,
        type: "network",
        position: { x: (gateway ? (gateway.position_x ?? 0) + DEVICE_NODE_WIDTH / 2 : centre) - NETWORK_NODE_WIDTH / 2, y },
        draggable: true,
        selectable: false,
        data: {
          cidr: `${net.network_address}/${net.prefix_length}`,
          vlan: net.vlan_name || (net.vlan_id != null ? `VLAN ${net.vlan_id}` : null),
          deviceCount: members.length,
        },
      });
    }
    return out;
  }, [data.networks, data.devices, membership]);

  const networkEdges: Edge[] = useMemo(() => {
    const shown = new Set(networkNodes.map((n) => n.id));
    const out: Edge[] = [];
    for (const net of data.networks) {
      const nodeId = `network-${net.id}`;
      if (!shown.has(nodeId)) continue;
      for (const d of data.devices) {
        if (membership.get(d.id) !== net) continue;
        const isGateway = d.ip_address === net.gateway_ip;
        const dimmed = matchedDeviceIds !== null && !matchedDeviceIds.has(d.id);
        out.push({
          id: `member-${net.id}-${d.id}`,
          source: isGateway ? `device-${d.id}` : nodeId,
          target: isGateway ? nodeId : `device-${d.id}`,
          type: "smoothstep",
          style: {
            stroke: "#8b5cf6",
            strokeWidth: isGateway ? 2.5 : 1.5,
            opacity: dimmed ? 0.1 : 0.8,
          },
        });
      }
    }
    return out;
  }, [data.networks, data.devices, membership, networkNodes, matchedDeviceIds]);

  const deviceNodes: Node[] = useMemo(
    () =>
      data.devices.map((device) => ({
        id: `device-${device.id}`,
        type: "device",
        position: {
          x: device.position_x ?? 0,
          y: device.position_y ?? 0,
        },
        data: {
          // Short hostname (first DNS label) keeps node labels readable.
          label:
            device.sys_name ||
            device.hostname?.split(".")[0] ||
            device.ip_address,
          ip: device.ip_address,
          deviceType: device.device_type,
          vendor: device.vendor,
          snmpReachable: device.snmp_reachable,
          interfaceCount: device.interfaces.length,
        },
        style: {
          opacity:
            matchedDeviceIds === null || matchedDeviceIds.has(device.id)
              ? 1
              : 0.15,
          transition: "opacity 0.2s ease",
        },
      })),
    [data.devices, matchedDeviceIds],
  );

  const initialNodes = useMemo(
    () => [...networkNodes, ...deviceNodes],
    [networkNodes, deviceNodes],
  );

  const linkEdges: Edge[] = useMemo(
    () =>
      data.links
        // Subnet-inferred links are drawn through the network node instead.
        .filter((link) => {
          if (link.discovery_method !== "subnet") return true;
          const a = membership.get(link.source_device_id);
          return !(a && a === membership.get(link.target_device_id));
        })
        .map((link) => {
        const color = getEdgeColor(link.discovery_method);
        const dimmed =
          matchedDeviceIds !== null &&
          !matchedDeviceIds.has(link.source_device_id) &&
          !matchedDeviceIds.has(link.target_device_id);

        const parts: string[] = [];
        if (link.discovery_method)
          parts.push(formatMethod(link.discovery_method));
        if (link.bandwidth_mbps)
          parts.push(formatBandwidth(link.bandwidth_mbps));
        const label = parts.length > 0 ? parts.join(" ") : undefined;

        return {
          id: `link-${link.id}`,
          source: `device-${link.source_device_id}`,
          target: `device-${link.target_device_id}`,
          type: "smoothstep",
          style: {
            stroke: color,
            strokeWidth: getStrokeWidth(link.bandwidth_mbps),
            opacity: dimmed ? 0.1 : 1,
            transition: "opacity 0.2s ease",
          },
          label,
          labelStyle: { fill: color, fontSize: 10, fontWeight: 500 },
        };
      }),
    [data.links, matchedDeviceIds, membership],
  );

  const initialEdges = useMemo(
    () => [...networkEdges, ...linkEdges],
    [networkEdges, linkEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes/edges when search filter or data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (!node.id.startsWith("device-")) return;
      const deviceId = parseInt(node.id.replace("device-", ""), 10);
      const device = data.devices.find((d) => d.id === deviceId);
      if (device) setSelectedDevice(device);
    },
    [data.devices],
  );

  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_, node) => {
      if (!node.id.startsWith("device-")) return;
      const deviceId = parseInt(node.id.replace("device-", ""), 10);
      api
        .updatePositions(data.scan_id, [
          { device_id: deviceId, x: node.position.x, y: node.position.y },
        ])
        .catch((err) => {
          console.error("Failed to save position:", err);
        });
    },
    [data.scan_id],
  );

  return (
    <div className="h-full w-full relative">
      {/* Stats bar */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 flex-wrap">
        {Object.entries(data.stats.device_types).map(([type, count]) => (
          <div
            key={type}
            className="px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg border border-[var(--border-subtle)]"
          >
            <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
              {type.replace("_", " ")}
            </span>
            <span className="ml-1.5 text-sm font-black text-[var(--accent-primary)]">
              {count}
            </span>
          </div>
        ))}
        <div className="px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg border border-[var(--border-subtle)]">
          <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
            Links
          </span>
          <span className="ml-1.5 text-sm font-black text-[var(--green)]">
            {data.stats.link_count}
          </span>
        </div>
        <div className="px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg border border-[var(--border-subtle)]">
          <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">
            Networks
          </span>
          <span className="ml-1.5 text-sm font-black text-[var(--purple)]">
            {data.stats.network_count}
          </span>
        </div>
      </div>

      {/* Discovery method legend */}
      <div className="absolute top-16 left-4 z-10 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-lg border border-[var(--border-subtle)]">
        <div className="text-[8px] text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
          Discovery
        </div>
        <div className="flex gap-3">
          {DISCOVERY_LEGEND.map(({ method, color }) => (
            <div key={method} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: color, boxShadow: `0 0 6px ${color}` }}
              />
              <span className="text-[9px] text-[var(--text-secondary)]">
                {method}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.25 }}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1a0835"
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "network") return "#8b5cf6";
            const dt = (node.data as { deviceType?: string }).deviceType;
            if (dt === "firewall") return "#d4af37";
            if (dt === "router") return "#06b6d4";
            if (dt === "switch") return "#3b82f6";
            if (dt === "server") return "#8b5cf6";
            return "#6b7280";
          }}
          maskColor="rgba(0, 0, 0, 0.8)"
        />
      </ReactFlow>

      {selectedDevice && (
        <DevicePanel
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
        />
      )}
    </div>
  );
}
