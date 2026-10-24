import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ScanSearch, Search } from "lucide-react";
import { api, type DeviceData, type ScanResponse } from "../services/api";
import { ListSkeleton } from "../components/Skeleton";
import { compareIp } from "../lib/topology";
import {
  deviceType,
  displayName,
  formatDateTime,
  formatUptime,
  sortedTypeCounts,
} from "../lib/devices";

/** Text a device matches the search box against. */
function haystack(d: DeviceData): string {
  return [
    d.ip_address,
    d.hostname,
    d.sys_name,
    d.vendor,
    d.mac_address,
    d.os_family,
    d.os_version,
    d.device_type,
    d.sys_location,
    d.sys_contact,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** /devices: every device of one completed scan as a sortable, searchable list. */
export default function Devices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");

  const { data: scans, isLoading: scansLoading, isError: scansError } = useQuery<ScanResponse[]>({
    queryKey: ["scans", "all"],
    queryFn: () => api.listScans(200),
  });
  const completed = useMemo(() => (scans ?? []).filter((s) => s.status === "completed"), [scans]);

  const param = searchParams.get("scan");
  const scanId =
    param && completed.some((s) => String(s.id) === param) ? parseInt(param, 10) : completed[0]?.id;

  const {
    data: devices,
    isLoading: devicesLoading,
    isError: devicesError,
  } = useQuery<DeviceData[]>({
    queryKey: ["devices", scanId],
    queryFn: () => api.getScanDevices(scanId!),
    enabled: scanId != null,
  });

  const sorted = useMemo(
    () => [...(devices ?? [])].sort((a, b) => compareIp(a.ip_address, b.ip_address)),
    [devices],
  );
  const types = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of sorted) counts[d.device_type] = (counts[d.device_type] ?? 0) + 1;
    return sortedTypeCounts(counts);
  }, [sorted]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((d) => (!type || d.device_type === type) && (!q || haystack(d).includes(q)));
  }, [sorted, query, type]);

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div>
        <div className="eyebrow">Inventory</div>
        <h1>Devices</h1>
        <p className="text-[13px] text-ink-65 mt-1">
          Everything one scan found. Click a device to see it on the topology.
        </p>
      </div>
      {completed.length > 0 && (
        <div className="w-full sm:w-auto min-w-0">
          <label className="label" htmlFor="dev-scan">Scan</label>
          <select
            id="dev-scan"
            className="input !h-9 w-full sm:!w-[360px]"
            value={scanId ?? ""}
            onChange={(e) => {
              setType("");
              setSearchParams({ scan: e.target.value });
            }}
          >
            {completed.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} {s.target_ip} · {s.device_count} devices · {formatDateTime(s.created_at)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  if (scansLoading) {
    return (
      <>
        {head}
        <ListSkeleton />
      </>
    );
  }
  if (scansError) {
    return (
      <>
        {head}
        <p className="text-[13px] text-red" role="alert">Could not load scans.</p>
      </>
    );
  }
  if (completed.length === 0) {
    return (
      <>
        {head}
        <div className="card text-center px-6 py-14">
          <h2>No completed scan yet</h2>
          <p className="text-[13px] text-ink-65 mt-1 mb-5">Run a scan and its devices will be listed here.</p>
          <Link to="/scan" className="btn btn-primary btn-sm">
            <ScanSearch className="w-4 h-4" aria-hidden /> New scan
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <section className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <b>
            {devices
              ? filtered.length === sorted.length
                ? `${sorted.length} ${sorted.length === 1 ? "device" : "devices"}`
                : `${filtered.length} of ${sorted.length} devices`
              : "Devices"}
          </b>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <select
              className="input !h-9 sm:!w-[160px]"
              aria-label="Filter by device type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All types</option>
              {types.map(([t, n]) => (
                <option key={t} value={t}>
                  {deviceType(t).label} ({n})
                </option>
              ))}
            </select>
            <div className="relative w-full sm:w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-45" aria-hidden />
              <input
                type="search"
                className="input !h-9 !pl-9"
                placeholder="Search IP, name, MAC, vendor"
                aria-label="Search devices"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {devicesLoading ? (
          <div className="p-4"><ListSkeleton /></div>
        ) : devicesError ? (
          <p className="p-6 text-[13px] text-red" role="alert">Could not load the devices of scan #{scanId}.</p>
        ) : sorted.length === 0 ? (
          <p className="p-6 text-[13px] text-ink-65">Scan #{scanId} found no devices.</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-[13px] text-ink-65">No device matches.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>IP</th>
                  <th>Type</th>
                  <th>Vendor / OS</th>
                  <th>MAC</th>
                  <th>SNMP</th>
                  <th>Interfaces</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const info = deviceType(d.device_type);
                  const os = [d.os_family, d.os_version].filter(Boolean).join(" ");
                  const uptime = formatUptime(d.uptime_seconds);
                  return (
                    <tr key={d.id}>
                      <td>
                        <Link
                          to={`/topology/${scanId}?device=${d.id}`}
                          className="font-mono font-medium hover:text-accent"
                        >
                          {displayName(d)}
                        </Link>
                      </td>
                      <td className="mono">{d.ip_address}</td>
                      <td><span className={`badge ${info.badge}`}>{info.label}</span></td>
                      <td>
                        {d.vendor || os ? (
                          <>
                            {d.vendor && <span className="block">{d.vendor}</span>}
                            {os && <span className="block text-xs text-ink-65">{os}</span>}
                          </>
                        ) : (
                          <span className="text-ink-45">-</span>
                        )}
                      </td>
                      <td className="mono">{d.mac_address ?? "-"}</td>
                      <td>
                        {d.snmp_reachable ? (
                          <span className="badge b-teal" title={uptime ? `Up ${uptime}` : undefined}>
                            {uptime ? `up ${uptime}` : "yes"}
                          </span>
                        ) : (
                          <span className="badge b-grey">no</span>
                        )}
                      </td>
                      <td className="mono">{d.interfaces.length || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
