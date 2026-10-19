import { X, Wifi, WifiOff, HardDrive, ArrowUpDown } from "lucide-react";
import type { DeviceData } from "../../services/api";

interface DevicePanelProps {
  device: DeviceData;
  onClose: () => void;
}

function formatSpeed(mbps: number | null): string {
  if (!mbps) return "-";
  return mbps >= 1000 ? `${mbps / 1000}G` : `${mbps}M`;
}

export default function DevicePanel({ device, onClose }: DevicePanelProps) {
  return (
    <div className="absolute top-4 right-4 z-20 w-80 glass-card-static rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-sm font-bold">
            {device.sys_name || device.hostname || device.ip_address}
          </h3>
          <p className="text-[10px] text-[var(--text-muted)]">
            {device.device_type.replace("_", " ")} &middot; {device.ip_address}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/5 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
        {/* System info */}
        <div className="space-y-1.5">
          {device.vendor && <InfoRow label="Vendor" value={device.vendor} />}
          {device.os_family && (
            <InfoRow
              label="OS"
              value={`${device.os_family}${device.os_version ? ` ${device.os_version}` : ""}`}
            />
          )}
          {device.mac_address && (
            <InfoRow label="MAC" value={device.mac_address} />
          )}
          {device.sys_location && (
            <InfoRow label="Location" value={device.sys_location} />
          )}
          <InfoRow
            label="SNMP"
            value={device.snmp_reachable ? "Reachable" : "Not reachable"}
            icon={
              device.snmp_reachable ? (
                <Wifi className="w-3 h-3 text-[var(--green)]" />
              ) : (
                <WifiOff className="w-3 h-3 text-[var(--text-muted)]" />
              )
            }
          />
        </div>

        {/* Interfaces */}
        {device.interfaces.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 flex items-center gap-1">
              <HardDrive className="w-3 h-3" /> Interfaces (
              {device.interfaces.length})
            </h4>
            <div className="space-y-1">
              {device.interfaces
                .filter((i) => i.oper_status === "up" || i.ip_address)
                .map((iface) => (
                  <div key={iface.id} className="p-2 bg-black/20 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold">
                        {iface.name ||
                          iface.description ||
                          `if${iface.if_index}`}
                      </span>
                      <span
                        className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                          iface.oper_status === "up"
                            ? "bg-[var(--green-glow)] text-[var(--green)]"
                            : "bg-white/5 text-[var(--text-muted)]"
                        }`}
                      >
                        {iface.oper_status || "?"}
                      </span>
                    </div>
                    <div className="flex gap-2 text-[9px] text-[var(--text-muted)]">
                      {iface.ip_address && <span>{iface.ip_address}</span>}
                      {iface.speed_mbps && (
                        <span>{formatSpeed(iface.speed_mbps)}</span>
                      )}
                      {iface.vlan_id && <span>VLAN {iface.vlan_id}</span>}
                    </div>
                    {(iface.utilization_in || iface.utilization_out) && (
                      <div className="flex items-center gap-2 mt-1 text-[8px]">
                        <ArrowUpDown className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                        <span className="text-[var(--cyan)]">
                          In: {iface.utilization_in?.toFixed(1)}%
                        </span>
                        <span className="text-[var(--gold)]">
                          Out: {iface.utilization_out?.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[11px] font-medium flex items-center gap-1">
        {icon}
        {value}
      </span>
    </div>
  );
}
