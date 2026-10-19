import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ScanSearch,
  Network,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Activity,
} from "lucide-react";
import { api, type ScanResponse, type StatsData } from "../services/api";
import { DEVICE_COLORS } from "../components/topology/DeviceNode";
import { DashboardSkeleton } from "../components/Skeleton";

/* ── Format Helpers ───────────────────────────────────── */

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: "#10b981", background: "rgba(16,185,129,0.12)" }}
        >
          <CheckCircle className="w-3 h-3" /> Complete
        </span>
      );
    case "running":
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: "#06b6d4", background: "rgba(6,182,212,0.12)" }}
        >
          <Loader2 className="w-3 h-3 animate-spin" /> Running
        </span>
      );
    case "failed":
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)" }}
        >
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
    default:
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: "#64748b", background: "rgba(255,255,255,0.05)" }}
        >
          <Clock className="w-3 h-3" /> {status}
        </span>
      );
  }
}

/* ── Device Type Donut Chart ──────────────────────────── */

function DeviceTypeChart({
  deviceTypes,
}: {
  deviceTypes: Record<string, number>;
}) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 52;
  const strokeWidth = 20;

  const { arcs, total } = useMemo(() => {
    const entries = Object.entries(deviceTypes).filter(
      ([, count]) => count > 0,
    );
    const t = entries.reduce((sum, [, count]) => sum + count, 0);
    if (t === 0) return { arcs: [], total: 0 };

    let currentAngle = -90; // Start from top
    const computed = entries.map(([type, count]) => {
      const pct = count / t;
      const angle = pct * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);
      const largeArc = angle > 180 ? 1 : 0;
      const color = DEVICE_COLORS[type] || "#6b7280";

      const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

      return { type, count, pct, color, d };
    });

    return { arcs: computed, total: t };
  }, [deviceTypes, cx, cy, radius]);

  if (total === 0) return null;

  const card: React.CSSProperties = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    padding: 20,
    transition: "all 0.3s ease",
    backdropFilter: "blur(40px)",
    WebkitBackdropFilter: "blur(40px)",
    boxShadow:
      "0 4px 6px rgba(0,0,0,0.15), 0 20px 50px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
  };

  return (
    <div style={card} className="hover-card">
      <span
        className="text-[13px] font-semibold uppercase tracking-[0.5px] block mb-4"
        style={{ color: "var(--text-secondary)" }}
      >
        Device Types
      </span>
      <div className="flex items-center gap-6">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Arcs */}
          {arcs.map(({ type, color, d }) => (
            <path
              key={type}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          ))}
          {/* Center text */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fill="white"
            fontSize="22"
            fontWeight="800"
          >
            {total}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize="10"
          >
            devices
          </text>
        </svg>
        <div className="flex-1 space-y-2">
          {arcs.map(({ type, count, pct, color }) => (
            <div key={type} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <span className="text-[12px] text-white capitalize flex-1">
                {type.replace("_", " ")}
              </span>
              <span className="text-[12px] font-semibold" style={{ color }}>
                {count}
              </span>
              <span
                className="text-[10px]"
                style={{ color: "var(--text-faint)" }}
              >
                {Math.round(pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────── */

export default function Dashboard() {
  const { data: scans, isLoading } = useQuery<ScanResponse[]>({
    queryKey: ["scans"],
    queryFn: api.listScans,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const completedScans = scans?.filter((s) => s.status === "completed") ?? [];
  const failedScans = scans?.filter((s) => s.status === "failed") ?? [];
  const runningScans = scans?.filter((s) => s.status === "running") ?? [];
  const totalDevices = completedScans.reduce(
    (sum, s) => sum + s.device_count,
    0,
  );
  const totalLinks = completedScans.reduce((sum, s) => sum + s.link_count, 0);
  const successRate =
    scans && scans.length > 0
      ? Math.round((completedScans.length / scans.length) * 100)
      : 0;
  const lastScan = scans?.[0];

  const { data: statsData } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: api.getStats,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  /* ── Card styles — glassmorphism matching reference ─── */
  const card: React.CSSProperties = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    padding: 20,
    transition: "all 0.3s ease",
    backdropFilter: "blur(40px)",
    WebkitBackdropFilter: "blur(40px)",
    boxShadow:
      "0 4px 6px rgba(0,0,0,0.15), 0 20px 50px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
  };

  /* ── Score ring ─────────────────────────────────────── */
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (successRate / 100) * circumference;

  return (
    <div style={{ padding: "24px 28px" }} className="grid gap-5">
      {/* 2-column grid matching reference .main-content */}
      <div className="grid gap-5 dashboard-grid">
        {/* ── Top Left: Scan Summary Stats ───────────── */}
        <div style={card} className="hover-card">
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[13px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Scan Overview
            </span>
            <Link
              to="/scan"
              className="text-xs cursor-pointer"
              style={{ color: "var(--accent-primary)" }}
            >
              New Scan
            </Link>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total", value: scans?.length ?? 0, color: "#06b6d4" },
              { label: "Devices", value: totalDevices, color: "#22d3ee" },
              { label: "Links", value: totalLinks, color: "#7c3aed" },
              { label: "Active", value: runningScans.length, color: "#10b981" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-bold" style={{ color }}>
                  {value}
                </div>
                <div
                  className="text-[11px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Top Right: Network Breakdown (progress bars) */}
        <div style={card} className="hover-card">
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[13px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Scan Results
            </span>
            <Link
              to="/history"
              className="text-xs cursor-pointer"
              style={{ color: "var(--accent-primary)" }}
            >
              History
            </Link>
          </div>

          {/* Progress bars */}
          <div className="space-y-[18px]">
            {[
              {
                label: "Completed Scans",
                value: completedScans.length,
                max: Math.max(scans?.length ?? 1, 1),
                pct: scans?.length
                  ? Math.round((completedScans.length / scans.length) * 100)
                  : 0,
              },
              {
                label: "Devices Discovered",
                value: totalDevices,
                max: Math.max(totalDevices, 1),
                pct: totalDevices > 0 ? 100 : 0,
              },
              {
                label: "Links Mapped",
                value: totalLinks,
                max: Math.max(totalLinks, 1),
                pct: totalLinks > 0 ? 100 : 0,
              },
            ].map(({ label, value, pct }) => (
              <div key={label}>
                <div className="flex justify-between mb-2">
                  <span
                    className="text-[13px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    {value}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background:
                        "linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Left: Health Score Ring (spans 2 rows) ──── */}
        <div
          style={{
            ...card,
            gridRow: "span 2",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(145deg, rgba(6,182,212,0.05) 0%, rgba(124,58,237,0.03) 100%)",
            borderColor: "rgba(6, 182, 212, 0.2)",
          }}
          className="hover-card"
        >
          {/* SVG gradient def */}
          <svg width="0" height="0">
            <defs>
              <linearGradient
                id="scoreGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>

          {/* Ring */}
          <div className="relative" style={{ width: 200, height: 200 }}>
            <svg
              width="200"
              height="200"
              viewBox="0 0 200 200"
              style={{
                transform: "rotate(-90deg)",
                filter: "drop-shadow(0 0 20px rgba(6, 182, 212, 0.4))",
              }}
            >
              <circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="14"
              />
              <circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke="url(#scoreGrad)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 1.5s ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div
                className="text-[52px] font-bold"
                style={{
                  color: "var(--accent-primary)",
                  textShadow: "0 0 30px rgba(6, 182, 212, 0.5)",
                }}
              >
                {successRate}%
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--text-secondary)", marginTop: 4 }}
              >
                Scan Health Score
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex gap-[10px] flex-wrap mt-7 justify-center">
            {[
              { label: `${completedScans.length} Passed`, icon: CheckCircle },
              { label: `${failedScans.length} Failed`, icon: XCircle },
              { label: `${runningScans.length} Active`, icon: Activity },
            ].map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-[14px] py-[10px] rounded-[10px] cursor-default transition-all"
                style={{
                  background: "rgba(6, 182, 212, 0.08)",
                  border: "1px solid rgba(6, 182, 212, 0.3)",
                }}
              >
                <Icon
                  className="w-[18px] h-[18px]"
                  style={{ color: "var(--accent-primary)" }}
                />
                <span className="text-xs font-semibold text-white">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right Middle: Quick Actions (report-btn style) */}
        <div style={card} className="hover-card">
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[13px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Quick Actions
            </span>
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            {[
              { label: "New Scan", icon: ScanSearch, to: "/scan" },
              {
                label: "Topology",
                icon: Network,
                to: lastScan ? `/topology/${lastScan.id}` : "/scan",
              },
              { label: "History", icon: Clock, to: "/history" },
              { label: "Settings", icon: Activity, to: "/settings" },
            ].map(({ label, icon: Icon, to }) => (
              <Link
                key={label}
                to={to}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-[10px] transition-all"
                style={{
                  background: "rgba(6, 182, 212, 0.1)",
                  border: "1px solid rgba(6, 182, 212, 0.25)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(6, 182, 212, 0.2)";
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "var(--accent-primary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(6, 182, 212, 0.1)";
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "rgba(6, 182, 212, 0.25)";
                }}
              >
                <Icon
                  className="w-4 h-4"
                  style={{ color: "var(--accent-primary)" }}
                />
                <span className="text-xs font-semibold text-white">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Right Bottom: Recent Scans (file-list style) */}
        <div style={card} className="hover-card">
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[13px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Recent Scans
            </span>
            <Link
              to="/history"
              className="text-xs cursor-pointer"
              style={{ color: "var(--accent-primary)" }}
            >
              View all
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {!scans || scans.length === 0 ? (
              <div className="text-center py-8">
                <Network
                  className="w-10 h-10 mx-auto mb-3"
                  style={{ color: "var(--text-faint)" }}
                />
                <p
                  className="text-sm mb-3"
                  style={{ color: "var(--text-secondary)" }}
                >
                  No scans yet
                </p>
                <Link
                  to="/scan"
                  className="btn-primary text-sm"
                  style={{ padding: "10px 20px" }}
                >
                  <ScanSearch className="w-4 h-4" />
                  Run First Scan
                </Link>
              </div>
            ) : (
              scans.slice(0, 4).map((scan) => (
                <Link
                  key={scan.id}
                  to={
                    scan.status === "completed"
                      ? `/topology/${scan.id}`
                      : `/scan?poll=${scan.id}`
                  }
                  className="flex items-center gap-3 px-[14px] py-3 rounded-[10px] transition-all group"
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.04)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(6, 182, 212, 0.1)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "rgba(6, 182, 212, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(255, 255, 255, 0.02)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "rgba(255, 255, 255, 0.04)";
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
                    }}
                  >
                    <Network
                      className="w-[18px] h-[18px]"
                      style={{ color: "var(--accent-primary)" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-white truncate">
                      {scan.target_ip} — {scan.device_count} devices,{" "}
                      {scan.link_count} links
                    </div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <StatusBadge status={scan.status} />
                      <span className="ml-2">
                        {formatRelativeTime(scan.created_at)}
                      </span>
                    </div>
                  </div>
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <ArrowRight
                      className="w-[14px] h-[14px]"
                      style={{ color: "var(--text-secondary)" }}
                    />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Device Type Donut Chart ───────────────────── */}
      {statsData && Object.keys(statsData.device_types).length > 0 && (
        <DeviceTypeChart deviceTypes={statsData.device_types} />
      )}

      {/* ── Bottom: Full-Width Stats Bar ─────────────── */}
      {scans && scans.length > 0 && (
        <div style={{ ...card, gridColumn: "span 2" }} className="hover-card">
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-[13px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Network Intelligence Summary
            </span>
            <Link
              to="/history"
              className="text-xs cursor-pointer"
              style={{ color: "var(--accent-primary)" }}
            >
              Export
            </Link>
          </div>
          <div className="grid grid-cols-6 gap-4">
            {[
              { label: "Total Scans", value: scans.length, color: "#06b6d4" },
              {
                label: "Completed",
                value: completedScans.length,
                color: "#10b981",
              },
              { label: "Failed", value: failedScans.length, color: "#ef4444" },
              { label: "Devices", value: totalDevices, color: "#22d3ee" },
              { label: "Links", value: totalLinks, color: "#7c3aed" },
              { label: "Success", value: `${successRate}%`, color: "#06b6d4" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center py-2">
                <div className="text-2xl font-bold" style={{ color }}>
                  {value}
                </div>
                <div
                  className="text-[11px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
