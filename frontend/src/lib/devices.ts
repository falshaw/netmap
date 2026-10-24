import {
  Shield,
  Router,
  Network,
  Wifi,
  Server,
  Monitor,
  Printer,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

export type DeviceTypeInfo = {
  type: string;
  label: string;
  /** CSS colour (a theme token), used for nodes, legend dots and bars. */
  color: string;
  icon: LucideIcon;
  badge: string;
};

/** Infrastructure first; this order is used in legends and breakdowns. */
export const DEVICE_TYPES: DeviceTypeInfo[] = [
  { type: "firewall", label: "Firewall", color: "var(--c-firewall)", icon: Shield, badge: "b-red" },
  { type: "router", label: "Router", color: "var(--c-router)", icon: Router, badge: "b-teal" },
  { type: "switch", label: "Switch", color: "var(--c-switch)", icon: Network, badge: "b-blue" },
  { type: "wireless_ap", label: "Wireless AP", color: "var(--c-wireless_ap)", icon: Wifi, badge: "b-teal" },
  { type: "server", label: "Server", color: "var(--c-server)", icon: Server, badge: "b-violet" },
  { type: "endpoint", label: "Endpoint", color: "var(--c-endpoint)", icon: Monitor, badge: "b-grey" },
  { type: "printer", label: "Printer", color: "var(--c-printer)", icon: Printer, badge: "b-amber" },
  { type: "unknown", label: "Unknown", color: "var(--c-unknown)", icon: CircleHelp, badge: "b-grey" },
];

const BY_TYPE = new Map(DEVICE_TYPES.map((d) => [d.type, d]));

export function deviceType(type: string | null | undefined): DeviceTypeInfo {
  return BY_TYPE.get(type ?? "unknown") ?? {
    ...DEVICE_TYPES[DEVICE_TYPES.length - 1],
    type: type ?? "unknown",
    label: (type ?? "unknown").replace(/_/g, " "),
  };
}

/** Sort a {type: count} map into the canonical order, dropping zeros. */
export function sortedTypeCounts(counts: Record<string, number>): [string, number][] {
  const order = (t: string) => {
    const i = DEVICE_TYPES.findIndex((d) => d.type === t);
    return i === -1 ? DEVICE_TYPES.length : i;
  };
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => order(a[0]) - order(b[0]) || b[1] - a[1]);
}

/** Short display name: SNMP sysName, else the first DNS label, else the IP. */
export function displayName(d: {
  sys_name: string | null;
  hostname: string | null;
  ip_address: string;
}): string {
  return d.sys_name || d.hostname?.split(".")[0] || d.ip_address;
}

/** SNMP sysUpTime in seconds as "12d 3h", "3h 4m" or "4m". */
export function formatUptime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatSpeed(mbps: number | null | undefined): string {
  if (!mbps) return "-";
  return mbps >= 1000 ? `${mbps / 1000} Gb/s` : `${mbps} Mb/s`;
}

/**
 * The API stores UTC timestamps without a zone ("2026-10-20T09:48:51").
 * Date.parse would read those as local time, so treat zone-less values as UTC.
 */
export function parseApiDate(dateStr: string): number {
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(dateStr);
  return Date.parse(hasZone ? dateStr : `${dateStr}Z`);
}

export function formatDuration(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) return null;
  const s = Math.max(0, Math.round((parseApiDate(end) - parseApiDate(start)) / 1000));
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(parseApiDate(dateStr)).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(dateStr: string | null, now = Date.now()): string {
  if (!dateStr) return "-";
  const diffMin = Math.floor((now - parseApiDate(dateStr)) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(parseApiDate(dateStr)).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
