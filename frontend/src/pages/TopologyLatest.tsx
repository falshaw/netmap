import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Waypoints } from "lucide-react";
import { api, type ScanResponse } from "../services/api";

/** /topology: open the most recent completed scan, or explain why there is none. */
export default function TopologyLatest() {
  const { data, isLoading, isError } = useQuery<ScanResponse[]>({
    queryKey: ["scans", "all"],
    queryFn: () => api.listScans(200),
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center min-h-[40vh]" aria-busy="true">
        <Loader2 className="w-8 h-8 spin text-accent" aria-label="Loading" />
      </div>
    );
  }

  const latest = data?.find((s) => s.status === "completed");
  if (latest) return <Navigate to={`/topology/${latest.id}`} replace />;

  return (
    <>
      <div className="mb-5">
        <div className="eyebrow">Tools</div>
        <h1>Topology</h1>
      </div>
      <div className="card p-8 text-center max-w-[520px] mx-auto">
        <span className="grid place-items-center w-12 h-12 rounded-2xl bg-accent-soft text-accent mx-auto mb-4" aria-hidden>
          <Waypoints className="w-6 h-6" />
        </span>
        <h2>{isError ? "Could not load scans" : "No completed scan yet"}</h2>
        <p className="text-[13px] text-ink-65 mt-1">
          The topology shows the devices, links and subnets of a completed
          scan. Run one, or pick an older scan from the history.
        </p>
        <div className="flex gap-2 justify-center mt-5">
          <Link to="/scan" className="btn btn-primary btn-sm">New scan</Link>
          <Link to="/history" className="btn btn-ghost btn-sm">History</Link>
        </div>
      </div>
    </>
  );
}
