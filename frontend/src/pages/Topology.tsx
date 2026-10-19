import { useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, AlertCircle, Search } from "lucide-react";
import { api, type TopologyData } from "../services/api";
import TopologyCanvas from "../components/topology/TopologyCanvas";
import ExportMenu from "../components/ExportMenu";

const DEVICE_TYPE_PILLS = [
  { type: "firewall", label: "Firewall", color: "#d4af37" },
  { type: "router", label: "Router", color: "#06b6d4" },
  { type: "switch", label: "Switch", color: "#3b82f6" },
  { type: "server", label: "Server", color: "#8b5cf6" },
  { type: "endpoint", label: "Endpoint", color: "#6b7280" },
];

export default function Topology() {
  const { scanId } = useParams<{ scanId: string }>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<TopologyData>({
    queryKey: ["topology", scanId],
    queryFn: () => api.getTopology(parseInt(scanId!, 10)),
    enabled: !!scanId && Number.isFinite(parseInt(scanId!, 10)),
  });

  const toggleFilter = useCallback((type: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2
          className="w-10 h-10 animate-spin mb-4"
          style={{ color: "var(--accent-primary)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading topology...
        </p>
      </div>
    );
  }

  if (error || !data) {
    const errMsg = (error as Error)?.message || "";
    const isScanRunning =
      errMsg.includes("not complete") || errMsg.includes("running");

    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <AlertCircle
          className="w-10 h-10 mb-4"
          style={{
            color: isScanRunning ? "var(--accent-primary)" : "var(--red)",
          }}
        />
        <p
          className="text-sm mb-4"
          style={{
            color: isScanRunning ? "var(--text-secondary)" : "var(--red)",
          }}
        >
          {isScanRunning
            ? "This scan is still in progress."
            : errMsg || "Failed to load topology"}
        </p>
        <div className="flex gap-3">
          {isScanRunning && (
            <Link
              to={`/scan?poll=${scanId}`}
              className="btn-primary"
              style={{ padding: "10px 20px" }}
            >
              View Progress
            </Link>
          )}
          <Link to="/dashboard" className="btn-secondary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b topology-toolbar"
        style={{
          background: "rgba(3, 0, 20, 0.95)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-sm font-bold text-white">
              Scan #{data.scan_id}
            </h1>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {data.stats.device_count} devices &middot; {data.stats.link_count}{" "}
              links &middot; {data.stats.network_count} networks
            </p>
          </div>
        </div>

        {/* Search + filter pills */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field !py-1.5 !pl-8 !pr-3 !text-xs"
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="flex gap-1">
            {DEVICE_TYPE_PILLS.map(({ type, label, color }) => (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className="px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: activeFilters.has(type)
                    ? `${color}33`
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${activeFilters.has(type) ? color : "rgba(255,255,255,0.06)"}`,
                  color: activeFilters.has(type) ? color : "var(--text-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <ExportMenu scanId={data.scan_id} canvasRef={canvasRef} />
        </div>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1">
        <TopologyCanvas
          data={data}
          searchQuery={searchQuery}
          activeFilters={activeFilters}
        />
      </div>
    </div>
  );
}
