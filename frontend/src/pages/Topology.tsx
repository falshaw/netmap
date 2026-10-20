import { useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, Search } from "lucide-react";
import axios from "axios";
import { api, errorMessage, type TopologyData } from "../services/api";
import TopologyCanvas, { LINK_METHODS } from "../components/topology/TopologyCanvas";
import ExportMenu from "../components/ExportMenu";
import { deviceType, sortedTypeCounts } from "../lib/devices";

export default function Topology() {
  const { scanId = "" } = useParams<{ scanId: string }>();
  const id = /^\d+$/.test(scanId) ? parseInt(scanId, 10) : NaN;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<TopologyData>({
    queryKey: ["topology", scanId],
    queryFn: () => api.getTopology(id),
    enabled: Number.isFinite(id),
    retry: (count, err) =>
      count < 1 && !(axios.isAxiosError(err) && [400, 404].includes(err.response?.status ?? 0)),
  });

  const toggleFilter = useCallback((type: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  if (!Number.isFinite(id)) {
    return (
      <div className="card p-8 text-center max-w-[460px] mx-auto">
        <h1 className="!text-xl">No such scan</h1>
        <p className="text-[13px] text-ink-65 mt-2">“{scanId}” is not a scan number.</p>
        <Link to="/history" className="btn btn-primary btn-sm mt-5">Scan history</Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid place-items-center min-h-[50vh] text-ink-65" aria-busy="true">
        <div className="text-center">
          <Loader2 className="w-8 h-8 spin mx-auto mb-3 text-accent" aria-hidden />
          Loading topology…
        </div>
      </div>
    );
  }

  if (error || !data) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const msg = errorMessage(error, "Failed to load topology");
    const running = status === 400 && /running|pending/.test(msg);
    return (
      <div className="card p-8 text-center max-w-[480px] mx-auto">
        <AlertCircle className={`w-9 h-9 mx-auto mb-3 ${running ? "text-accent" : "text-red"}`} aria-hidden />
        <h1 className="!text-xl">
          {status === 404 ? `Scan #${id} not found` : running ? `Scan #${id} is still running` : "No topology"}
        </h1>
        <p className="text-[13px] text-ink-65 mt-2">
          {status === 404 ? "It may have been deleted." : msg}
        </p>
        <div className="flex gap-2 justify-center mt-5">
          {running && (
            <Link to={`/scan?poll=${id}`} className="btn btn-primary btn-sm">View progress</Link>
          )}
          <Link to="/history" className="btn btn-ghost btn-sm">Scan history</Link>
        </div>
      </div>
    );
  }

  const types = sortedTypeCounts(data.stats.device_types);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="eyebrow">
            <Link to="/history" className="hover:text-accent">History</Link> / Scan #{data.scan_id}
          </div>
          <h1>Topology</h1>
          <p className="text-[13px] text-ink-65 mt-0.5">
            {data.stats.device_count} devices · {data.stats.link_count} links ·{" "}
            {data.stats.network_count} {data.stats.network_count === 1 ? "subnet" : "subnets"}
            <span className="hidden sm:inline"> · drag nodes to arrange, click one for details</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-45" aria-hidden />
            <input
              type="search"
              placeholder="Search devices"
              aria-label="Search devices by name, IP, MAC or vendor"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input !h-8 !w-[200px] !pl-9 !text-[13px] !rounded-full"
            />
          </div>
          <ExportMenu scanId={data.scan_id} canvasRef={canvasRef} />
        </div>
      </div>

      {types.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Filter by device type">
          {types.map(([t, n]) => {
            const info = deviceType(t);
            const on = activeFilters.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleFilter(t)}
                aria-pressed={on}
                className="pill cursor-pointer border"
                style={{
                  borderColor: on ? info.color : "var(--g-line)",
                  background: on ? `color-mix(in srgb, ${info.color} 14%, transparent)` : "var(--g-bg2)",
                  color: on ? info.color : "var(--ink-65)",
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: info.color }} aria-hidden />
                {info.label} <span className="font-mono">{n}</span>
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button type="button" onClick={() => setActiveFilters(new Set())} className="pill p-grey cursor-pointer">
              Clear
            </button>
          )}
        </div>
      )}

      {data.devices.length === 0 ? (
        <div className="card p-8 text-center">
          <h2>No devices found</h2>
          <p className="text-[13px] text-ink-65 mt-1">
            Nothing answered in the scanned range. Check the subnets and that the
            scanner can reach them.
          </p>
          <Link to="/scan" className="btn btn-primary btn-sm mt-5">New scan</Link>
        </div>
      ) : (
        <div ref={canvasRef} className="topo-canvas">
          <TopologyCanvas data={data} searchQuery={searchQuery} activeFilters={activeFilters} />
        </div>
      )}

      <div className="legend lines mt-3">
        {LINK_METHODS.map((m) => (
          <span key={m.method} style={{ "--c": m.color } as React.CSSProperties}>{m.label}</span>
        ))}
        <span style={{ "--c": "var(--edge)" } as React.CSSProperties}>Other</span>
      </div>
    </>
  );
}
