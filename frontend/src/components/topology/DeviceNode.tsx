import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Shield,
  Router,
  Server,
  Monitor,
  Printer,
  Wifi,
  HardDrive,
  CircleDot,
} from "lucide-react";

interface DeviceNodeData {
  label: string;
  ip: string;
  deviceType: string;
  vendor: string | null;
  snmpReachable: boolean;
  interfaceCount: number;
  [key: string]: unknown;
}

const DEVICE_ICONS: Record<string, typeof Shield> = {
  firewall: Shield,
  router: Router,
  switch: HardDrive,
  server: Server,
  endpoint: Monitor,
  printer: Printer,
  wireless_ap: Wifi,
  unknown: CircleDot,
};

export const DEVICE_COLORS: Record<string, string> = {
  firewall: "#d4af37",
  router: "#06b6d4",
  switch: "#3b82f6",
  server: "#8b5cf6",
  endpoint: "#6b7280",
  printer: "#6b7280",
  wireless_ap: "#06b6d4",
  unknown: "#6b7280",
};

/** Fixed node width; the server-side layout spaces columns for it. */
export const DEVICE_NODE_WIDTH = 170;

const hexToRgba = (hex: string, a: number) => {
  const [r, g, b] = hex.match(/\w\w/g)!.map((x) => parseInt(x, 16));
  return `rgba(${r},${g},${b},${a})`;
};

function DeviceNode({ data }: { data: DeviceNodeData }) {
  const Icon = DEVICE_ICONS[data.deviceType] || CircleDot;
  const color = DEVICE_COLORS[data.deviceType] || "#6b7280";

  return (
    <div
      className="relative px-3 py-2.5 rounded-xl border-2 shadow-2xl transition-all duration-200 hover:scale-[1.03]"
      style={{
        width: DEVICE_NODE_WIDTH,
        borderColor: hexToRgba(color, 0.45),
        background: "#0a0520",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !border-2 !border-[var(--bg-primary)]"
        style={{ background: color }}
      />

      {/* SNMP indicator */}
      {data.snmpReachable && (
        <div
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: "var(--green)" }}
          title="SNMP reachable"
        >
          <span className="text-[6px] font-black text-white">S</span>
        </div>
      )}

      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: hexToRgba(color, 0.08), color }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white truncate max-w-[110px]">
            {data.label}
          </h3>
          <p
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color }}
          >
            {data.deviceType.replace("_", " ")}
          </p>
        </div>
      </div>

      <div className="bg-black/30 rounded-lg px-2 py-1 mb-1.5">
        <code className="text-[11px] text-[var(--text-secondary)] font-mono">
          {data.ip}
        </code>
      </div>

      <div className="flex gap-1.5 text-[10px]">
        {data.vendor && (
          <span className="px-1.5 py-0.5 bg-white/5 text-[var(--text-muted)] rounded truncate max-w-[80px]">
            {data.vendor}
          </span>
        )}
        {data.interfaceCount > 0 && (
          <span
            className="px-1.5 py-0.5 rounded font-bold"
            style={{ background: hexToRgba(color, 0.06), color }}
          >
            {data.interfaceCount} ifs
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !border-2 !border-[var(--bg-primary)]"
        style={{ background: "var(--purple)" }}
      />
    </div>
  );
}

export default memo(DeviceNode);
