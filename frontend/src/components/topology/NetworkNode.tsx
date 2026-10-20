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
    <div className="net-node" title={`Subnet ${data.cidr}`}>
      <Handle type="target" position={Position.Top} style={{ background: "var(--accent)" }} />
      <Network aria-hidden />
      <div className="min-w-0">
        <code className="truncate">{data.cidr}</code>
        <small>
          {data.vlan ? `${data.vlan} · ` : ""}
          {data.deviceCount} {data.deviceCount === 1 ? "host" : "hosts"}
        </small>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "var(--accent)" }} />
    </div>
  );
}

export default memo(NetworkNode);
