import { Loader2 } from "lucide-react";

const LABEL: Record<string, string> = {
  completed: "Completed",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
};

export function ScanStatusPill({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "p-ok"
      : status === "failed"
        ? "p-risk"
        : status === "running" || status === "pending"
          ? "p-run"
          : "p-grey";
  return (
    <span className={`pill ${cls}`}>
      {(status === "running" || status === "pending") && (
        <Loader2 className="w-3 h-3 spin" aria-hidden />
      )}
      {LABEL[status] ?? status}
    </span>
  );
}

/** Round status glyph used at the start of scan rows. */
export function ScanStatusIcon({ status }: { status: string }) {
  if (status === "completed")
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" className="flex-none" aria-hidden>
        <circle cx="13" cy="13" r="10" fill="none" stroke="var(--teal)" strokeWidth="3" />
        <path d="M8.5 13.2l3 3 6-6.4" fill="none" stroke="var(--teal)" strokeWidth="2.2" />
      </svg>
    );
  if (status === "failed")
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" className="flex-none" aria-hidden>
        <circle cx="13" cy="13" r="10" fill="none" stroke="var(--red)" strokeWidth="3" />
        <path d="M9.5 9.5l7 7M16.5 9.5l-7 7" fill="none" stroke="var(--red)" strokeWidth="2.2" />
      </svg>
    );
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" className="flex-none spin" aria-hidden>
      <circle cx="13" cy="13" r="10" fill="none" stroke="var(--track)" strokeWidth="3" />
      <path d="M13 3a10 10 0 0110 10" fill="none" stroke="var(--accent)" strokeWidth="3" />
    </svg>
  );
}
