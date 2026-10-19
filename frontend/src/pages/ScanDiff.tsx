import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Plus,
  Minus,
  RefreshCw,
  Shield,
  Router,
  Server,
  Monitor,
  HardDrive,
  CircleDot,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api, type ScanDiffData, type DeviceChange } from "../services/api";

const card: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.02)",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 14,
  padding: 20,
  backdropFilter: "blur(40px)",
  WebkitBackdropFilter: "blur(40px)",
  boxShadow:
    "0 4px 6px rgba(0,0,0,0.15), 0 20px 50px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
};

const DEVICE_ICONS: Record<string, typeof Shield> = {
  firewall: Shield,
  router: Router,
  switch: HardDrive,
  server: Server,
  endpoint: Monitor,
  unknown: CircleDot,
};

const CHANGE_STYLES = {
  added: {
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.2)",
    icon: Plus,
  },
  removed: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    icon: Minus,
  },
  changed: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    icon: RefreshCw,
  },
};

function DeviceEntry({ device }: { device: DeviceChange }) {
  const style = CHANGE_STYLES[device.change_type];
  const Icon = DEVICE_ICONS[device.device_type] || CircleDot;
  const ChangeIcon = style.icon;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
    >
      <ChangeIcon
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: style.color }}
      />
      <Icon
        className="w-4 h-4 flex-shrink-0"
        style={{ color: "var(--text-secondary)" }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-white">
            {device.ip_address}
          </span>
          {device.hostname && (
            <span
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              ({device.hostname})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: style.color }}
          >
            {device.device_type}
          </span>
          {device.vendor && (
            <span
              className="text-[10px]"
              style={{ color: "var(--text-faint)" }}
            >
              {device.vendor}
            </span>
          )}
        </div>
        {device.changes && (
          <div className="mt-1 space-y-0.5">
            {Object.entries(device.changes).map(([field, change]) => (
              <div
                key={field}
                className="text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                <span className="font-semibold">{field}:</span>{" "}
                <span style={{ color: "#ef4444" }}>
                  {change.from || "none"}
                </span>
                {" → "}
                <span style={{ color: "#22c55e" }}>{change.to || "none"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffSection({
  title,
  count,
  color,
  children,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div style={card}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left"
      >
        {open ? (
          <ChevronDown
            className="w-4 h-4"
            style={{ color: "var(--text-muted)" }}
          />
        ) : (
          <ChevronRight
            className="w-4 h-4"
            style={{ color: "var(--text-muted)" }}
          />
        )}
        <span className="text-[13px] font-semibold text-white">{title}</span>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ color, background: `${color}20` }}
        >
          {count}
        </span>
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

export default function ScanDiff() {
  const { scanIdA, scanIdB } = useParams<{
    scanIdA: string;
    scanIdB: string;
  }>();

  const { data, isLoading, error } = useQuery<ScanDiffData>({
    queryKey: ["scanDiff", scanIdA, scanIdB],
    queryFn: () =>
      api.compareScan(parseInt(scanIdA!, 10), parseInt(scanIdB!, 10)),
    enabled:
      !!scanIdA &&
      !!scanIdB &&
      Number.isFinite(parseInt(scanIdA!, 10)) &&
      Number.isFinite(parseInt(scanIdB!, 10)),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2
          className="w-10 h-10 animate-spin mb-4"
          style={{ color: "var(--accent-primary)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Comparing scans...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <AlertCircle
          className="w-10 h-10 mb-4"
          style={{ color: "var(--red)" }}
        />
        <p className="text-sm mb-4" style={{ color: "var(--red)" }}>
          {(error as Error)?.message || "Failed to compare scans"}
        </p>
        <Link to="/history" className="btn-secondary">
          Back to History
        </Link>
      </div>
    );
  }

  const totalChanges =
    data.devices_added.length +
    data.devices_removed.length +
    data.devices_changed.length;

  return (
    <div className="min-h-screen flex items-start justify-center p-6">
      <div
        className="w-full rounded-[20px] overflow-hidden"
        style={{
          maxWidth: 900,
          border: "1px solid var(--accent-primary)",
          boxShadow:
            "0 0 60px rgba(6, 182, 212, 0.15), 0 25px 80px rgba(0, 0, 0, 0.5)",
          background:
            "linear-gradient(145deg, rgba(15,35,64,0.95), rgba(10,22,40,0.98))",
        }}
      >
        {/* Toolbar */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <Link
              to="/history"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-bold text-white">
                Scan #{data.scan_a_id} vs #{data.scan_b_id}
              </h1>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {data.devices_added.length} added &middot;{" "}
                {data.devices_removed.length} removed &middot;{" "}
                {data.devices_changed.length} changed &middot;{" "}
                {data.devices_unchanged} unchanged
              </p>
            </div>
          </div>

          {totalChanges === 0 && (
            <span
              className="text-[11px] font-semibold px-3 py-1 rounded-full"
              style={{
                color: "#22c55e",
                background: "rgba(34,197,94,0.12)",
              }}
            >
              No Changes
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: "Added",
                value: data.devices_added.length,
                color: "#22c55e",
              },
              {
                label: "Removed",
                value: data.devices_removed.length,
                color: "#ef4444",
              },
              {
                label: "Changed",
                value: data.devices_changed.length,
                color: "#f59e0b",
              },
              {
                label: "Unchanged",
                value: data.devices_unchanged,
                color: "var(--text-muted)",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="text-center py-3 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="text-2xl font-bold" style={{ color }}>
                  {value}
                </div>
                <div
                  className="text-[10px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Device diffs */}
          <DiffSection
            title="Added Devices"
            count={data.devices_added.length}
            color="#22c55e"
          >
            {data.devices_added.map((d) => (
              <DeviceEntry key={d.ip_address} device={d} />
            ))}
          </DiffSection>

          <DiffSection
            title="Removed Devices"
            count={data.devices_removed.length}
            color="#ef4444"
          >
            {data.devices_removed.map((d) => (
              <DeviceEntry key={d.ip_address} device={d} />
            ))}
          </DiffSection>

          <DiffSection
            title="Changed Devices"
            count={data.devices_changed.length}
            color="#f59e0b"
          >
            {data.devices_changed.map((d) => (
              <DeviceEntry key={d.ip_address} device={d} />
            ))}
          </DiffSection>

          {/* Link diffs */}
          {(data.links_added.length > 0 ||
            data.links_removed.length > 0 ||
            data.links_changed.length > 0) && (
            <div style={card}>
              <h3 className="text-[13px] font-semibold text-white mb-3">
                Link Changes
              </h3>
              <div className="space-y-1.5">
                {data.links_added.map((l, i) => (
                  <div
                    key={`la-${i}`}
                    className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded"
                    style={{ background: "rgba(34,197,94,0.06)" }}
                  >
                    <Plus className="w-3 h-3" style={{ color: "#22c55e" }} />
                    <span className="text-white">
                      {l.source_ip} &harr; {l.target_ip}
                    </span>
                    {l.discovery_method && (
                      <span style={{ color: "var(--text-faint)" }}>
                        ({l.discovery_method})
                      </span>
                    )}
                  </div>
                ))}
                {data.links_removed.map((l, i) => (
                  <div
                    key={`lr-${i}`}
                    className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded"
                    style={{ background: "rgba(239,68,68,0.06)" }}
                  >
                    <Minus className="w-3 h-3" style={{ color: "#ef4444" }} />
                    <span className="text-white">
                      {l.source_ip} &harr; {l.target_ip}
                    </span>
                    {l.discovery_method && (
                      <span style={{ color: "var(--text-faint)" }}>
                        ({l.discovery_method})
                      </span>
                    )}
                  </div>
                ))}
                {data.links_changed.map((l, i) => (
                  <div
                    key={`lc-${i}`}
                    className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded"
                    style={{ background: "rgba(245,158,11,0.06)" }}
                  >
                    <RefreshCw
                      className="w-3 h-3"
                      style={{ color: "#f59e0b" }}
                    />
                    <span className="text-white">
                      {l.source_ip} &harr; {l.target_ip}
                    </span>
                    {l.discovery_method && (
                      <span style={{ color: "var(--text-faint)" }}>
                        ({l.discovery_method})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unchanged summary */}
          {data.devices_unchanged > 0 && totalChanges > 0 && (
            <div
              className="text-center py-3 rounded-lg text-[12px]"
              style={{
                background: "rgba(255,255,255,0.01)",
                border: "1px solid rgba(255,255,255,0.04)",
                color: "var(--text-muted)",
              }}
            >
              {data.devices_unchanged} unchanged devices &middot;{" "}
              {data.links_unchanged} unchanged links
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
