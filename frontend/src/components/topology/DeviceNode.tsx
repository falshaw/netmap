import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { deviceType } from "../../lib/devices";

export interface DeviceNodeData {
  label: string;
  ip: string;
  deviceType: string;
  vendor: string | null;
  snmpReachable: boolean;
  interfaceCount: number;
  [key: string]: unknown;
}

/** Fixed node width; the server-side layout spaces columns for it. */
export const DEVICE_NODE_WIDTH = 180;

function DeviceNode({ data }: { data: DeviceNodeData }) {
  const info = deviceType(data.deviceType);
  const Icon = info.icon;
  return (
    <div
      className="dev-node relative"
      style={{ "--c": info.color } as React.CSSProperties}
      title={`${data.label} · ${data.ip}`}
    >
      <Handle type="target" position={Position.Top} style={{ background: info.color }} />
      {data.snmpReachable && (
        <span className="snmp" title="SNMP reachable">SNMP</span>
      )}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="ic" aria-hidden>
          <Icon />
        </span>
        <div className="min-w-0">
          <div className="name">{data.label}</div>
          <div className="type">{info.label}</div>
        </div>
      </div>
      <div className="ip">{data.ip}</div>
      {(data.vendor || data.interfaceCount > 0) && (
        <div className="meta">
          {data.vendor && <span>{data.vendor}</span>}
          {data.interfaceCount > 0 && (
            <span className="shrink-0">{data.interfaceCount} interfaces</span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: info.color }} />
    </div>
  );
}

export default memo(DeviceNode);
