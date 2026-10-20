import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { DeviceData, LinkData } from "../../services/api";
import { deviceType, displayName, formatSpeed } from "../../lib/devices";
import { CodeBlock, type CodeLine } from "../CodeBlock";

interface DevicePanelProps {
  device: DeviceData;
  devices: DeviceData[];
  links: LinkData[];
  onSelect: (device: DeviceData) => void;
  onClose: () => void;
}

function Fact({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="fact">
      <span>{label}</span>
      {value ? (
        <b className={mono ? "mono" : undefined}>{value}</b>
      ) : (
        <b className="!font-normal text-ink-45">not found</b>
      )}
    </div>
  );
}

/** The SNMP data the scan stored, as walk-style lines. */
function snmpLines(device: DeviceData): CodeLine[] {
  const lines: CodeLine[] = [];
  if (device.sys_name || device.sys_descr || device.sys_location) {
    lines.push({ k: `system (${device.ip_address}:161)`, comment: true });
    if (device.sys_name) lines.push({ k: "sysName.0", v: device.sys_name });
    if (device.sys_descr) lines.push({ k: "sysDescr.0", v: device.sys_descr });
    if (device.sys_location) lines.push({ k: "sysLocation.0", v: device.sys_location });
  }
  const ifaces = [...device.interfaces].sort((a, b) => (a.if_index ?? 0) - (b.if_index ?? 0));
  if (ifaces.length) {
    lines.push({ k: "ifTable (1.3.6.1.2.1.2.2.1)", comment: true });
    for (const i of ifaces) {
      const idx = i.if_index ?? "?";
      lines.push({ k: `ifName.${idx}`, v: i.name ?? i.description });
      lines.push({ k: `ifOperStatus.${idx}`, v: i.oper_status });
      if (i.speed_mbps) lines.push({ k: `ifHighSpeed.${idx}`, v: i.speed_mbps });
    }
  }
  return lines;
}

export default function DevicePanel({ device, devices, links, onSelect, onClose }: DevicePanelProps) {
  const info = deviceType(device.device_type);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [device.id, onClose]);

  const byId = new Map(devices.map((d) => [d.id, d]));
  const neighbours = links
    .filter((l) => l.source_device_id === device.id || l.target_device_id === device.id)
    .map((l) => ({
      link: l,
      other: byId.get(l.source_device_id === device.id ? l.target_device_id : l.source_device_id),
    }))
    .filter((n): n is { link: LinkData; other: DeviceData } => !!n.other);

  const lines = snmpLines(device);
  const os = [device.os_family, device.os_version].filter(Boolean).join(" ") || null;

  return (
    <aside className="dev-panel" aria-label={`Device ${displayName(device)}`}>
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4 pb-3 border-b border-line">
        <div className="min-w-0">
          <div className="eyebrow">Device</div>
          <h2 className="font-mono !text-[16px] truncate">{displayName(device)}</h2>
          <div className="text-[13px] text-ink-65">
            {info.label} · <span className="font-mono">{device.ip_address}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`badge ${device.snmp_reachable ? "b-teal" : "b-grey"}`}>
            {device.snmp_reachable ? "SNMP" : "no SNMP"}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="theme-btn !px-2"
            aria-label="Close device details"
          >
            <X aria-hidden />
          </button>
        </div>
      </div>

      <div className="body">
        <div className="facts">
          <Fact label="IP" value={device.ip_address} mono />
          <Fact label="MAC" value={device.mac_address} mono />
          <Fact label="Vendor" value={device.vendor} />
          <Fact label="OS" value={os} />
          <Fact label="Hostname" value={device.hostname} mono />
          {device.sys_location && <Fact label="Location" value={device.sys_location} />}
          <Fact label="Interfaces" value={String(device.interfaces.length)} />
          <Fact label="Links" value={String(neighbours.length)} />
        </div>

        {lines.length > 0 ? (
          <CodeBlock label="Stored SNMP data" lines={lines} maxHeight={260} />
        ) : (
          <p className="text-[12.5px] text-ink-65">
            No SNMP data stored for this device. It did not answer SNMP, or
            SNMP was off for this scan.
          </p>
        )}

        <div>
          <div className="eyebrow mb-1.5">Links</div>
          {neighbours.length === 0 ? (
            <p className="text-[12.5px] text-ink-65">No links to other devices.</p>
          ) : (
            <ul className="grid gap-1">
              {neighbours.map(({ link, other }) => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(other)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[10px] hover:bg-accent-soft text-left cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[12.5px] truncate">{displayName(other)}</span>
                      <span className="block font-mono text-[11px] text-ink-45">{other.ip_address}</span>
                    </span>
                    <span className="badge b-grey shrink-0">
                      {(link.discovery_method ?? "link").toUpperCase()}
                      {link.bandwidth_mbps ? ` · ${formatSpeed(link.bandwidth_mbps)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {device.interfaces.length > 0 && (
          <div>
            <div className="eyebrow mb-1.5">Interfaces</div>
            <div className="ift">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Speed</th>
                    <th>VLAN</th>
                    <th>IP</th>
                    <th>In / out</th>
                  </tr>
                </thead>
                <tbody>
                  {device.interfaces.map((i) => (
                    <tr key={i.id}>
                      <td className="mono">{i.name || i.description || `if${i.if_index}`}</td>
                      <td>
                        <span className={`badge ${i.oper_status === "up" ? "b-teal" : "b-grey"}`}>
                          {i.oper_status || "?"}
                        </span>
                      </td>
                      <td>{formatSpeed(i.speed_mbps)}</td>
                      <td className="mono">{i.vlan_id ?? "-"}</td>
                      <td className="mono">{i.ip_address ?? "-"}</td>
                      <td className="mono">
                        {i.utilization_in != null || i.utilization_out != null
                          ? `${i.utilization_in?.toFixed(1) ?? "-"}% / ${i.utilization_out?.toFixed(1) ?? "-"}%`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
