import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { useQueryClient } from "@tanstack/react-query";

import DeviceNode, { DEVICE_NODE_WIDTH } from "./DeviceNode";
import NetworkNode, { NETWORK_NODE_WIDTH } from "./NetworkNode";
import DevicePanel from "./DevicePanel";
import type { TopologyData, DeviceData } from "../../services/api";
import { api } from "../../services/api";
import { assignNetworks } from "../../lib/topology";
import { displayName } from "../../lib/devices";
import { useTheme } from "../ThemeToggle";

const nodeTypes = { device: DeviceNode, network: NetworkNode };

const NETWORK_GAP_Y = 150;

/** Link colour by how the link was discovered (CSS tokens, theme aware). */
export const LINK_METHODS = [
  { method: "cdp", label: "CDP / LLDP", color: "var(--teal)" },
  { method: "routing", label: "Routing", color: "var(--amber)" },
  { method: "arp", label: "ARP", color: "var(--red)" },
  { method: "subnet", label: "Subnet", color: "var(--accent)" },
];

function edgeColor(method: string | null): string {
  if (method === "cdp" || method === "lldp") return "var(--teal)";
  if (method === "routing") return "var(--amber)";
  if (method === "arp") return "var(--red)";
  if (method === "subnet") return "var(--accent)";
  return "var(--edge)";
}

function strokeWidth(mbps: number | null): number {
  if (!mbps) return 1.6;
  if (mbps <= 100) return 1.6;
  if (mbps <= 1000) return 2.2;
  if (mbps <= 10000) return 3;
  return 4;
}

function formatBandwidth(mbps: number): string {
  return mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`;
}

/** Minimap fills are SVG attributes, which cannot use CSS variables. */
const MINIMAP = {
  light: {
    firewall: "#b91c1c", router: "#0d9488", switch: "#2563eb", wireless_ap: "#0891b2",
    server: "#6d28d9", endpoint: "#475569", printer: "#b45309", unknown: "#64748b",
    network: "#93c5fd", mask: "rgba(238,242,247,0.7)", dot: "rgba(23,32,51,0.16)",
  },
  dark: {
    firewall: "#f87171", router: "#2dd4bf", switch: "#3b82f6", wireless_ap: "#22d3ee",
    server: "#a78bfa", endpoint: "#94a3b8", printer: "#fbbf24", unknown: "#94a3b8",
    network: "#1e3a8a", mask: "rgba(12,17,27,0.7)", dot: "rgba(255,255,255,0.1)",
  },
} as const;

interface TopologyCanvasProps {
  data: TopologyData;
  searchQuery?: string;
  activeFilters?: Set<string>;
}

export default function TopologyCanvas({
  data,
  searchQuery = "",
  activeFilters,
}: TopologyCanvasProps) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const palette = MINIMAP[theme];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState(false);
  const query = useDeferredValue(searchQuery.trim().toLowerCase());
  const filters = useDeferredValue(activeFilters);

  const matchedDeviceIds = useMemo(() => {
    const filtering = filters && filters.size > 0;
    if (!query && !filtering) return null;
    const ids = new Set<number>();
    for (const d of data.devices) {
      if (filtering && !filters!.has(d.device_type)) continue;
      if (
        !query ||
        d.ip_address.includes(query) ||
        (d.hostname?.toLowerCase().includes(query) ?? false) ||
        (d.sys_name?.toLowerCase().includes(query) ?? false) ||
        (d.vendor?.toLowerCase().includes(query) ?? false) ||
        (d.mac_address?.toLowerCase().includes(query) ?? false) ||
        d.device_type.includes(query)
      )
        ids.add(d.id);
    }
    return ids;
  }, [data.devices, query, filters]);

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
      const x = gateway ? (gateway.position_x ?? 0) + DEVICE_NODE_WIDTH / 2 : centre;
      out.push({
        id: `network-${net.id}`,
        type: "network",
        position: { x: x - NETWORK_NODE_WIDTH / 2, y },
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

  const deviceNodes: Node[] = useMemo(
    () =>
      data.devices.map((device) => ({
        id: `device-${device.id}`,
        type: "device",
        position: { x: device.position_x ?? 0, y: device.position_y ?? 0 },
        selected: device.id === selectedId,
        data: {
          label: displayName(device),
          ip: device.ip_address,
          deviceType: device.device_type,
          vendor: device.vendor,
          snmpReachable: device.snmp_reachable,
          interfaceCount: device.interfaces.length,
        },
        style: {
          opacity: matchedDeviceIds === null || matchedDeviceIds.has(device.id) ? 1 : 0.18,
          transition: "opacity 0.2s ease",
        },
      })),
    [data.devices, matchedDeviceIds, selectedId],
  );

  const edgesAll: Edge[] = useMemo(() => {
    const dim = (ids: number[]) =>
      matchedDeviceIds !== null && ids.every((id) => !matchedDeviceIds.has(id));
    const out: Edge[] = [];
    const shown = new Set(networkNodes.map((n) => n.id));
    for (const net of data.networks) {
      const nodeId = `network-${net.id}`;
      if (!shown.has(nodeId)) continue;
      for (const d of data.devices) {
        if (membership.get(d.id) !== net) continue;
        const isGateway = d.ip_address === net.gateway_ip;
        out.push({
          id: `member-${net.id}-${d.id}`,
          source: isGateway ? `device-${d.id}` : nodeId,
          target: isGateway ? nodeId : `device-${d.id}`,
          type: "smoothstep",
          style: {
            stroke: "var(--accent)",
            strokeWidth: isGateway ? 2.4 : 1.5,
            strokeDasharray: isGateway ? undefined : "5 4",
            opacity: dim([d.id]) ? 0.12 : 0.75,
          },
        });
      }
    }
    for (const link of data.links) {
      // Subnet-inferred links inside one subnet are drawn through the network node.
      if (link.discovery_method === "subnet") {
        const a = membership.get(link.source_device_id);
        if (a && a === membership.get(link.target_device_id)) continue;
      }
      const color = edgeColor(link.discovery_method);
      const parts = [link.discovery_method?.toUpperCase(), link.bandwidth_mbps ? formatBandwidth(link.bandwidth_mbps) : null].filter(Boolean);
      out.push({
        id: `link-${link.id}`,
        source: `device-${link.source_device_id}`,
        target: `device-${link.target_device_id}`,
        type: "smoothstep",
        label: parts.length ? parts.join(" ") : undefined,
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 6,
        style: {
          stroke: color,
          strokeWidth: strokeWidth(link.bandwidth_mbps),
          opacity: dim([link.source_device_id, link.target_device_id]) ? 0.12 : 1,
        },
      });
    }
    return out;
  }, [data.networks, data.devices, data.links, membership, networkNodes, matchedDeviceIds]);

  const initialNodes = useMemo(() => [...networkNodes, ...deviceNodes], [networkNodes, deviceNodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesAll);

  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  useEffect(() => setEdges(edgesAll), [edgesAll, setEdges]);

  const selected = data.devices.find((d) => d.id === selectedId) ?? null;

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.id.startsWith("device-")) setSelectedId(parseInt(node.id.slice(7), 10));
  }, []);

  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_, node) => {
      if (!node.id.startsWith("device-")) return;
      const deviceId = parseInt(node.id.slice(7), 10);
      const { x, y } = node.position;
      // Keep the cached topology in step, so the moved node stays put when the
      // search/filter changes or the page is opened again from the cache.
      queryClient.setQueryData<TopologyData>(["topology", String(data.scan_id)], (old) =>
        old
          ? {
              ...old,
              devices: old.devices.map((d) =>
                d.id === deviceId ? { ...d, position_x: x, position_y: y } : d,
              ),
            }
          : old,
      );
      api
        .updatePositions(data.scan_id, [{ device_id: deviceId, x, y }])
        .then(() => setSaveError(false))
        .catch(() => setSaveError(true));
    },
    [data.scan_id, queryClient],
  );

  const onSelect = useCallback((d: DeviceData) => setSelectedId(d.id), []);
  const onClose = useCallback(() => setSelectedId(null), []);

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onClose}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color={palette.dot} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          ariaLabel="Topology overview"
          maskColor={palette.mask}
          nodeColor={(node) => {
            if (node.type === "network") return palette.network;
            const t = (node.data as { deviceType?: string }).deviceType ?? "unknown";
            return (palette as Record<string, string>)[t] ?? palette.unknown;
          }}
          className="hidden sm:block"
          style={{ width: 150, height: 100 }}
        />
      </ReactFlow>

      {saveError && (
        <div className="topo-overlay top-3 left-3 !text-[12.5px] text-red" role="alert">
          Could not save the node position.
        </div>
      )}

      {selected && (
        <DevicePanel
          device={selected}
          devices={data.devices}
          links={data.links}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </div>
  );
}
