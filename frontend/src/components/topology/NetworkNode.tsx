import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Network } from "lucide-react";

export const NETWORK_NODE_WIDTH = 220;

interface NetworkNodeData {
  cidr: string;
  vlan: string | null;
  deviceCount: number;
  [key: string]: unknown;
}

/** A subnet / L2 segment. Not a device: it has no IP of its own. */
function NetworkNode({ data }: { data: NetworkNodeData }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-full border-2 border-dashed"
      style={{
        width: NETWORK_NODE_WIDTH,
        borderColor: "rgba(139,92,246,0.55)",
        background: "rgba(139,92,246,0.10)",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border-0"
        style={{ background: "var(--purple)" }}
      />
      <Network className="w-4 h-4 shrink-0" style={{ color: "var(--purple)" }} />
      <div className="min-w-0">
        <code className="block text-xs font-bold text-white font-mono truncate">
          {data.cidr}
        </code>
        <span className="block text-[10px] text-[var(--text-muted)]">
          {data.vlan ? `${data.vlan} · ` : ""}
          {data.deviceCount} {data.deviceCount === 1 ? "host" : "hosts"}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border-0"
        style={{ background: "var(--purple)" }}
      />
    </div>
  );
}

export default memo(NetworkNode);
