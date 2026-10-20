import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Link2, Network, ScanSearch, AlertCircle } from "lucide-react";
import {
  api,
  type ScanResponse,
  type TopologyData,
} from "../services/api";
import {
  deviceType,
  displayName,
  formatDuration,
  formatRelative,
  sortedTypeCounts,
} from "../lib/devices";
import { assignNetworks, compareIp } from "../lib/topology";
import { ScanStatusIcon, ScanStatusPill } from "../components/ScanStatus";
import { DashboardSkeleton } from "../components/Skeleton";

function today() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/* ── Devices per scan (last 7 scans, oldest first) ───────── */
function ScanBars({ scans }: { scans: ScanResponse[] }) {
  const recent = scans.slice(0, 7).reverse();
  const max = Math.max(1, ...recent.map((s) => s.device_count));
  return (
    <div className="bars" role="list" aria-label="Devices found per scan">
      {recent.map((s, i) => {
        const last = i === recent.length - 1;
        const pct = s.status === "completed" ? (s.device_count / max) * 100 : 0;
        const label =
          s.status === "completed"
            ? String(s.device_count)
            : s.status === "failed"
              ? "fail"
              : "…";
        return (
          <Link
            key={s.id}
            to={s.status === "completed" ? `/topology/${s.id}` : `/scan?poll=${s.id}`}
            role="listitem"
            aria-label={`Scan ${s.id}: ${s.status === "completed" ? `${s.device_count} devices` : s.status}`}
          >
            <div className={`col ${last ? "last" : ""}`}>
              <b style={{ height: `${pct}%` }} />
              <span
                style={
                  pct > 85
                    ? { top: 8, color: "#fff" }
                    : {
                        bottom: `calc(${pct}% + 6px)`,
                        color: s.status === "failed" ? "var(--red)" : undefined,
                      }
                }
              >
                {label}
              </span>
            </div>
            <small>#{s.id}</small>
          </Link>
        );
      })}
    </div>
  );
}

/* ── SNMP reach ring ─────────────────────────────────────── */
function DiscoveryRing({ topo }: { topo: TopologyData }) {
  const total = topo.devices.length;
  const snmp = topo.devices.filter((d) => d.snmp_reachable).length;
  const withMac = topo.devices.filter((d) => d.mac_address).length;
  const pct = total ? Math.round((snmp / total) * 100) : 0;
  const c = 2 * Math.PI * 58;
  return (
    <div className="flex flex-col sm:flex-row gap-[18px] items-center">
      <svg
        width="150"
        height="150"
        viewBox="0 0 150 150"
        className="flex-none"
        role="img"
        aria-label={`${snmp} of ${total} devices answered SNMP`}
      >
        <circle cx="75" cy="75" r="58" fill="none" stroke="var(--track)" strokeWidth="16" />
        <circle
          cx="75"
          cy="75"
          r="58"
          fill="none"
          stroke="#14b8a6"
          strokeWidth="16"
          strokeLinecap={snmp ? "round" : "butt"}
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          transform="rotate(-90 75 75)"
        />
        <text x="75" y="78" textAnchor="middle" fontWeight="700" fontSize="28" fill="var(--ink)">
          {pct}%
        </text>
        <text x="75" y="97" textAnchor="middle" fontSize="11" fill="var(--ink-45)">
          SNMP reachable
        </text>
      </svg>
      <div className="grid gap-3 flex-1 w-full">
        {[
          { c: "#2563eb", label: "Live hosts", n: total, by: "nmap / ARP" },
          { c: "#14b8a6", label: "SNMP", n: snmp, by: "v1 / v2c / v3" },
          { c: "var(--amber)", label: "MAC known", n: withMac, by: "L2" },
        ].map((r) => (
          <div key={r.label} className="flex justify-between items-baseline gap-3 text-xs text-ink-65">
            <span className="inline-flex items-start gap-1.5">
              <span className="mt-1 inline-block h-[7px] w-[7px] rounded-full" style={{ background: r.c }} aria-hidden />
              <span>
                {r.label}
                <b className="block text-[17px] text-ink">{r.n}</b>
              </span>
            </span>
            <em className="not-italic text-[11.5px] font-semibold text-teal shrink-0 text-right">{r.by}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Small topology preview from the real scan ───────────── */
const PREVIEW_COL_W = 190;
function TopologyPreview({ topo }: { topo: TopologyData }) {
  const layout = useMemo(() => {
    const member = assignNetworks(topo.devices, topo.networks);
    const nets = [...topo.networks]
      .filter((n) => topo.devices.some((d) => member.get(d.id) === n))
      .sort((a, b) => compareIp(a.network_address, b.network_address))
      .slice(0, 4);
    const colW = PREVIEW_COL_W;
    return nets.map((net, i) => {
      const cx = colW * i + colW / 2;
      const devs = topo.devices
        .filter((d) => member.get(d.id) === net)
        .sort((a, b) => compareIp(a.ip_address, b.ip_address));
      const gw = devs.find((d) => d.ip_address === net.gateway_ip) ?? null;
      const hosts = devs.filter((d) => d !== gw);
      return { net, cx, gw, hosts: hosts.slice(0, 3), more: Math.max(0, hosts.length - 3) };
    });
  }, [topo]);

  if (layout.length === 0) {
    return <p className="text-[13px] text-ink-65">This scan has no subnets to draw.</p>;
  }
  const W = layout.length * PREVIEW_COL_W;
  const nodeW = PREVIEW_COL_W - 30;
  const label = (s: string) => (s.length > 17 ? `${s.slice(0, 16)}…` : s);
  const total = topo.devices.length;

  return (
    <svg
      viewBox={`0 0 ${W} 290`}
      style={{ minWidth: layout.length > 1 ? layout.length * 150 : undefined, maxWidth: W * 1.25 }}
      role="img" aria-label={`Topology of scan ${topo.scan_id}: ${total} devices in ${topo.networks.length} subnets`}>
      {layout.map(({ net, cx, gw, hosts, more }) => (
        <g key={net.id}>
          {gw && <path className="lk" d={`M${cx} 48V90`} />}
          {hosts.map((_, j) => (
            <path key={j} className="lk" d={`M${cx} 120V${150 + j * 44}`} strokeDasharray="4 4" />
          ))}
          {gw && (
            <g>
              <rect className="nd" x={cx - nodeW / 2} y="14" width={nodeW} height="34" rx="10" />
              <circle cx={cx - nodeW / 2 + 16} cy="31" r="5" fill={deviceType(gw.device_type).color} />
              <text className="lb" x={cx - nodeW / 2 + 28} y="35">{label(displayName(gw))}</text>
            </g>
          )}
          <rect className="net" x={cx - nodeW / 2} y="90" width={nodeW} height="30" rx="15" />
          <text className="lb" x={cx} y="109" textAnchor="middle">
            {net.network_address}/{net.prefix_length}
          </text>
          {hosts.map((h, j) => (
            <g key={h.id}>
              <rect className="nd" x={cx - nodeW / 2} y={150 + j * 44} width={nodeW} height="32" rx="10" />
              <circle cx={cx - nodeW / 2 + 16} cy={166 + j * 44} r="5" fill={deviceType(h.device_type).color} />
              <text className="lb" x={cx - nodeW / 2 + 28} y={170 + j * 44}>{label(displayName(h))}</text>
            </g>
          ))}
          {more > 0 && (
            <text x={cx} y="284" textAnchor="middle" fontSize="11" fill="var(--ink-65)">
              +{more} more
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const scansQ = useQuery<ScanResponse[]>({
    queryKey: ["scans"],
    queryFn: () => api.listScans(),
    refetchInterval: (q) =>
      q.state.data?.some((s) => s.status === "running" || s.status === "pending") ? 3000 : 15000,
  });
  const scans = scansQ.data ?? [];
  const latest = scans.find((s) => s.status === "completed");

  const topoQ = useQuery<TopologyData>({
    queryKey: ["topology", String(latest?.id)],
    queryFn: () => api.getTopology(latest!.id),
    enabled: !!latest,
  });
  const topo = topoQ.data;

  if (scansQ.isLoading) return <DashboardSkeleton />;

  if (scansQ.isError) {
    return (
      <div className="alert alert-error" role="alert">
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
        Could not load scans. Is the API running?
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap justify-between items-center gap-4 mb-5">
      <div>
        <div className="eyebrow">
          {today()}
          {latest ? ` · last scan #${latest.id}` : ""}
        </div>
        <h1 className="!text-[28px]">Dashboard</h1>
      </div>
      {latest && (
        <span className="chip h-[38px] px-3.5 rounded-full bg-g-bg2 border border-g-line">
          <span className="font-mono">seed {latest.target_ip}</span> ·{" "}
          {latest.subnets?.length ?? 0} {latest.subnets?.length === 1 ? "subnet" : "subnets"}
        </span>
      )}
    </div>
  );

  if (scans.length === 0) {
    return (
      <>
        {header}
        <div className="cta flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative z-[1]">
            <h3 className="text-xl font-bold">Run your first scan</h3>
            <p className="text-[13px] opacity-85 mt-0.5">
              No scans yet. Point NetMap at a seed device and the subnets to
              walk; devices, links and subnets will show up here.
            </p>
          </div>
          <Link className="btn bg-white !text-[#1e40af] relative z-[1]" to="/scan">
            <ScanSearch className="w-4 h-4" aria-hidden /> New scan
          </Link>
        </div>
      </>
    );
  }

  const typeCounts = topo ? sortedTypeCounts(topo.stats.device_types) : [];
  const maxType = Math.max(1, ...typeCounts.map(([, n]) => n));

  return (
    <>
      {header}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.25fr_.75fr_1.1fr]">
        <section className="card p-[18px] min-w-0 md:col-span-2 xl:col-span-1">
          <div className="tile-h">
            <h2>Devices per scan</h2>
            <span className="chip">last {Math.min(7, scans.length)} scans</span>
          </div>
          <ScanBars scans={scans} />
        </section>

        <div className="grid gap-3">
          {[
            { icon: Monitor, c: "var(--accent)", n: topo?.stats.device_count, label: "Devices found" },
            { icon: Link2, c: "var(--teal)", n: topo?.stats.link_count, label: "Links mapped" },
            { icon: Network, c: "var(--amber)", n: topo?.stats.network_count, label: "Subnets" },
          ].map((s) => (
            <div key={s.label} className="card stat-tile p-[18px]">
              <div className="i" style={{ color: s.c }}>
                <s.icon aria-hidden />
              </div>
              <div>
                <b>{latest ? (s.n ?? "…") : "-"}</b>
                <small>{s.label}{latest ? "" : " (no completed scan)"}</small>
              </div>
            </div>
          ))}
        </div>

        <section className="card p-[18px] min-w-0">
          <div className="tile-h">
            <h2>Discovery</h2>
            {latest && <span className="chip font-mono">scan #{latest.id}</span>}
          </div>
          {topo ? (
            <DiscoveryRing topo={topo} />
          ) : (
            <p className="text-[13px] text-ink-65">
              {latest ? "Loading…" : "No completed scan yet."}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 mt-4 grid-cols-1 xl:grid-cols-[1.6fr_1fr]">
        <section className="card p-[18px] min-w-0">
          <div className="tile-h">
            <h2>Recent scans</h2>
            <Link className="chip-link" to="/history">History</Link>
          </div>
          {scans.slice(0, 5).map((s) => {
            const dur = formatDuration(s.started_at, s.completed_at);
            return (
              <Link
                key={s.id}
                to={s.status === "completed" ? `/topology/${s.id}` : `/scan?poll=${s.id}`}
                className="scan-row"
              >
                <ScanStatusIcon status={s.status} />
                <div className="min-w-0">
                  <b>
                    #{s.id} {s.target_ip}
                  </b>
                  <small>
                    {s.status === "failed"
                      ? s.error_message || "Scan failed"
                      : `${s.subnets?.length ?? 0} ${s.subnets?.length === 1 ? "subnet" : "subnets"} · ${s.device_count} devices, ${s.link_count} links · ${formatRelative(s.created_at)}`}
                  </small>
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs text-ink-65">
                  {dur && <span className="hidden sm:inline">{dur}</span>}
                  <ScanStatusPill status={s.status} />
                </div>
              </Link>
            );
          })}
        </section>

        <section className="card p-[18px] min-w-0">
          <div className="tile-h">
            <h2>Device types</h2>
            {latest && <span className="chip font-mono">scan #{latest.id}</span>}
          </div>
          {typeCounts.length === 0 ? (
            <p className="text-[13px] text-ink-65">
              {latest ? (topo ? "No devices in the last scan." : "Loading…") : "No completed scan yet."}
            </p>
          ) : (
            typeCounts.map(([t, n]) => {
              const info = deviceType(t);
              return (
                <div key={t} className="vp">
                  <span>{info.label}</span>
                  <i>
                    <b style={{ width: `${(n / maxType) * 100}%`, background: info.color }} />
                  </i>
                  <b>{n}</b>
                </div>
              );
            })
          )}
        </section>
      </div>

      {topo && latest && (
        <section className="card p-[18px] mt-4 min-w-0">
          <div className="tile-h">
            <h2>Topology preview</h2>
            <Link className="chip-link" to={`/topology/${latest.id}`}>Open topology</Link>
          </div>
          <div className="topo-prev">
            <TopologyPreview topo={topo} />
          </div>
          <div className="legend mt-2.5">
            {typeCounts.map(([t]) => (
              <span key={t} style={{ "--c": deviceType(t).color } as React.CSSProperties}>
                {deviceType(t).label}
              </span>
            ))}
            <span style={{ "--c": "var(--accent-soft)" } as React.CSSProperties}>Subnet</span>
            <span style={{ "--c": "var(--ink-45)" } as React.CSSProperties}>Dashed = subnet membership</span>
          </div>
        </section>
      )}

      <div className="cta mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative z-[1]">
          <h3 className="text-xl font-bold">Run a new scan</h3>
          <p className="text-[13px] opacity-85 mt-0.5">
            {latest
              ? `Scan #${latest.id} found ${latest.device_count} devices and ${latest.link_count} links ${formatRelative(latest.completed_at)}. Scan again to compare.`
              : "Point it at a seed device and the subnets to walk."}
          </p>
        </div>
        <Link className="btn bg-white !text-[#1e40af] relative z-[1]" to="/scan">
          New scan
        </Link>
      </div>
    </>
  );
}
