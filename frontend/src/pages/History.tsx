import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScanSearch, Trash2, GitCompareArrows, Search, AlertCircle } from "lucide-react";
import { api, errorMessage, type ScanResponse } from "../services/api";
import { ListSkeleton } from "../components/Skeleton";
import { ScanStatusIcon, ScanStatusPill } from "../components/ScanStatus";
import { formatDateTime, formatDuration } from "../lib/devices";

export default function History() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const { data: scans, isLoading, isError } = useQuery<ScanResponse[]>({
    queryKey: ["scans", "all"],
    queryFn: () => api.listScans(200),
    refetchInterval: (q) =>
      q.state.data?.some((s) => s.status === "running" || s.status === "pending") ? 3000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteScan(id),
    onSuccess: (_, id) => {
      setSelected((prev) => prev.filter((x) => x !== id));
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["topology", String(id)] });
      setConfirmDeleteId(null);
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!scans || !q) return scans ?? [];
    return scans.filter(
      (s) =>
        String(s.id) === q.replace(/^#/, "") ||
        s.target_ip.includes(q) ||
        (s.subnets ?? []).some((n) => n.includes(q)) ||
        s.status.includes(q),
    );
  }, [scans, query]);

  const toggleCompare = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev,
    );

  const compare = () => {
    const [a, b] = [...selected].sort((x, y) => x - y);
    navigate(`/compare/${a}/${b}`);
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <div className="eyebrow">Scans</div>
          <h1>History</h1>
          <p className="text-[13px] text-ink-65 mt-1">
            Every scan with its result. Tick two completed scans to compare them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={compare}
            disabled={selected.length !== 2}
            className="btn btn-ghost btn-sm"
          >
            <GitCompareArrows className="w-4 h-4" aria-hidden />
            Compare{selected.length ? ` (${selected.length}/2)` : ""}
          </button>
          <Link to="/scan" className="btn btn-primary btn-sm">
            <ScanSearch className="w-4 h-4" aria-hidden />
            New scan
          </Link>
        </div>
      </div>

      {deleteMutation.isError && (
        <div className="alert alert-error mb-4" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          {errorMessage(deleteMutation.error, "Could not delete the scan")}
        </div>
      )}

      <section className="card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <b>{scans ? `${scans.length} ${scans.length === 1 ? "scan" : "scans"}` : "Scans"}</b>
          <div className="relative w-full sm:w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-45" aria-hidden />
            <input
              type="search"
              className="input !h-9 !pl-9"
              placeholder="Search by #, IP, subnet, status"
              aria-label="Search scans"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-4"><ListSkeleton /></div>
        ) : isError ? (
          <p className="p-6 text-[13px] text-red" role="alert">Could not load scans.</p>
        ) : !scans || scans.length === 0 ? (
          <div className="text-center px-6 py-14">
            <h2>No scans yet</h2>
            <p className="text-[13px] text-ink-65 mt-1 mb-5">Run a scan and it will be listed here.</p>
            <Link to="/scan" className="btn btn-primary btn-sm">
              <ScanSearch className="w-4 h-4" aria-hidden /> New scan
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-[13px] text-ink-65">No scan matches “{query}”.</p>
        ) : (
          <ul>
            {filtered.map((s) => {
              const href = s.status === "completed" ? `/topology/${s.id}` : `/scan?poll=${s.id}`;
              const dur = formatDuration(s.started_at, s.completed_at);
              const isSel = selected.includes(s.id);
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-0 ${isSel ? "bg-accent-soft" : ""}`}
                >
                  <span className="w-4 shrink-0">
                    {s.status === "completed" && (
                      <input
                        type="checkbox"
                        checked={isSel}
                        disabled={!isSel && selected.length >= 2}
                        onChange={() => toggleCompare(s.id)}
                        aria-label={`Select scan ${s.id} to compare`}
                      />
                    )}
                  </span>
                  <ScanStatusIcon status={s.status} />
                  <Link to={href} className="min-w-0 flex-1 group">
                    <b className="block font-mono font-medium text-[13px] truncate group-hover:text-accent">
                      #{s.id} {s.target_ip}
                    </b>
                    <small className="block text-xs text-ink-65 truncate">
                      {s.status === "failed"
                        ? s.error_message || "Scan failed"
                        : `${s.device_count} devices · ${s.link_count} links${s.subnets?.length ? ` · ${s.subnets.join(", ")}` : ""}`}
                    </small>
                    <small className="block text-[11.5px] text-ink-45 truncate">
                      {formatDateTime(s.created_at)}
                      {dur ? ` · took ${dur}` : ""}
                    </small>
                  </Link>
                  <span className="hidden sm:block shrink-0"><ScanStatusPill status={s.status} /></span>
                  {s.status !== "running" && s.status !== "pending" && (
                    confirmDeleteId === s.id ? (
                      <span className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          className="btn btn-danger btn-sm !h-8"
                          onClick={() => deleteMutation.mutate(s.id)}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm !h-8"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm !h-8 !w-8 !p-0 shrink-0"
                        onClick={() => setConfirmDeleteId(s.id)}
                        aria-label={`Delete scan ${s.id}`}
                        title="Delete scan"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
