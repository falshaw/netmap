import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Network,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ArrowRight,
  ScanSearch,
  Trash2,
  GitCompareArrows,
} from "lucide-react";
import { api, type ScanResponse } from "../services/api";
import { HistorySkeleton } from "../components/Skeleton";

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

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="badge badge-green">
          <CheckCircle className="w-3 h-3" /> Complete
        </span>
      );
    case "running":
      return (
        <span className="badge badge-cyan">
          <Loader2 className="w-3 h-3 animate-spin" /> Running
        </span>
      );
    case "failed":
      return (
        <span className="badge badge-red">
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
    default:
      return (
        <span className="badge badge-muted">
          <Clock className="w-3 h-3" /> {status}
        </span>
      );
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: scans, isLoading } = useQuery<ScanResponse[]>({
    queryKey: ["scans"],
    queryFn: api.listScans,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<number>>(
    new Set(),
  );

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteScan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      setConfirmDeleteId(null);
    },
    onError: () => {
      setConfirmDeleteId(null);
    },
  });

  const toggleCompare = (id: number) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  };

  const compareSelected = () => {
    const ids = Array.from(selectedForCompare).sort((a, b) => a - b);
    if (ids.length === 2) {
      navigate(`/compare/${ids[0]}/${ids[1]}`);
    }
  };

  return (
    <div style={{ padding: "24px 28px" }} className="grid gap-5">
      {/* Header card */}
      <div style={card}>
        <div className="flex items-center justify-between">
          <div>
            <span
              className="text-[13px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Scan History
            </span>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              All previous network scans and their results
            </p>
          </div>
          <div className="flex gap-2">
            {selectedForCompare.size === 2 && (
              <button onClick={compareSelected} className="btn-secondary !py-2">
                <GitCompareArrows className="w-4 h-4" />
                Compare Selected
              </button>
            )}
            <Link to="/scan" className="btn-primary">
              <ScanSearch className="w-4 h-4" />
              New Scan
            </Link>
          </div>
        </div>
      </div>

      {/* Scans List card */}
      <div style={card}>
        {isLoading ? (
          <HistorySkeleton />
        ) : !scans || scans.length === 0 ? (
          <div className="text-center py-16">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{
                background:
                  "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
              }}
            >
              <Network
                className="w-7 h-7"
                style={{ color: "var(--accent-primary)" }}
              />
            </div>
            <p className="text-sm mb-1 font-medium text-white">No scans yet</p>
            <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
              Start your first network discovery.
            </p>
            <Link to="/scan" className="btn-primary">
              <ScanSearch className="w-4 h-4" />
              Run First Scan
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {scans.map((scan) => (
              <div
                key={scan.id}
                className="flex items-center gap-3 px-[14px] py-3 rounded-[10px] transition-all group"
                style={{
                  background: selectedForCompare.has(scan.id)
                    ? "rgba(6, 182, 212, 0.08)"
                    : "rgba(255, 255, 255, 0.02)",
                  border: `1px solid ${selectedForCompare.has(scan.id) ? "rgba(6, 182, 212, 0.3)" : "rgba(255, 255, 255, 0.04)"}`,
                }}
              >
                {/* Compare checkbox */}
                {scan.status === "completed" && (
                  <input
                    type="checkbox"
                    checked={selectedForCompare.has(scan.id)}
                    onChange={() => toggleCompare(scan.id)}
                    className="checkbox-accent"
                    title="Select for comparison"
                  />
                )}

                <Link
                  to={
                    scan.status === "completed"
                      ? `/topology/${scan.id}`
                      : `/scan?poll=${scan.id}`
                  }
                  className="flex items-center flex-1 min-w-0 gap-3"
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
                    <p className="text-[13px] font-medium text-white">
                      Scan #{scan.id} &mdash; {scan.target_ip}
                    </p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {scan.device_count} devices &middot; {scan.link_count}{" "}
                      links
                      {scan.subnets &&
                        scan.subnets.length > 0 &&
                        ` \u00b7 ${scan.subnets.join(", ")}`}
                    </p>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {scan.created_at && formatDate(scan.created_at)}
                      {scan.completed_at &&
                        ` \u2192 ${formatDate(scan.completed_at)}`}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-2">
                  <StatusBadge status={scan.status} />

                  {/* Delete button */}
                  {scan.status !== "running" && (
                    <>
                      {confirmDeleteId === scan.id ? (
                        <div className="flex items-center gap-1">
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--red)" }}
                          >
                            Delete?
                          </span>
                          <button
                            onClick={() => deleteMutation.mutate(scan.id)}
                            disabled={deleteMutation.isPending}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors"
                            style={{
                              background: "rgba(239,68,68,0.15)",
                              color: "#ef4444",
                            }}
                          >
                            {deleteMutation.isPending ? "..." : "Yes"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors"
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              color: "var(--text-muted)",
                            }}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(scan.id)}
                          className="w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: "rgba(255,255,255,0.05)" }}
                          title="Delete scan"
                        >
                          <Trash2
                            className="w-3.5 h-3.5"
                            style={{ color: "var(--text-muted)" }}
                          />
                        </button>
                      )}
                    </>
                  )}

                  <Link
                    to={
                      scan.status === "completed"
                        ? `/topology/${scan.id}`
                        : `/scan?poll=${scan.id}`
                    }
                    className="w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <ArrowRight
                      className="w-[14px] h-[14px]"
                      style={{ color: "var(--text-secondary)" }}
                    />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
