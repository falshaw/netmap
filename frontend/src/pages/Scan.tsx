import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ScanSearch, Loader2, AlertCircle, Plus, Minus } from "lucide-react";
import { api, type ScanResponse } from "../services/api";

/* ── Card style matching dashboard reference ─────────── */
const card: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.02)",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 14,
  padding: 24,
  backdropFilter: "blur(40px)",
  WebkitBackdropFilter: "blur(40px)",
  boxShadow:
    "0 4px 6px rgba(0,0,0,0.15), 0 20px 50px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
};

export default function ScanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pollId = searchParams.get("poll");

  const [targetIp, setTargetIp] = useState("");
  const [subnets, setSubnets] = useState([""]);
  const [snmpCommunity, setSnmpCommunity] = useState("public");
  const [snmpVersion, setSnmpVersion] = useState("2c");
  const [scanNmap, setScanNmap] = useState(true);
  const [scanArp, setScanArp] = useState(true);
  const [scanSnmp, setScanSnmp] = useState(true);
  const parsedPollId = pollId ? parseInt(pollId, 10) : null;
  const [activeScanId, setActiveScanId] = useState<number | null>(
    Number.isFinite(parsedPollId) ? parsedPollId : null,
  );

  // Poll scan status
  const { data: scanStatus } = useQuery<ScanResponse>({
    queryKey: ["scan", activeScanId],
    queryFn: () => api.getScan(activeScanId!),
    enabled: !!activeScanId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "completed" || data?.status === "failed")
        return false;
      return 2000;
    },
    refetchIntervalInBackground: false,
  });

  // Redirect when scan completes
  useEffect(() => {
    if (scanStatus?.status === "completed") {
      navigate(`/topology/${scanStatus.id}`);
    }
  }, [scanStatus, navigate]);

  const startScan = useMutation({
    mutationFn: api.createScan,
    onSuccess: (data) => {
      setActiveScanId(data.id);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startScan.mutate({
      target_ip: targetIp,
      subnets: subnets.filter((s) => s.trim()),
      snmp_community: snmpCommunity || undefined,
      snmp_version: snmpVersion,
      scan_nmap: scanNmap,
      scan_arp: scanArp,
      scan_snmp: scanSnmp,
    });
  };

  // Show loading while first poll resolves
  if (activeScanId && !scanStatus) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ padding: "24px 28px", minHeight: "calc(100vh - 64px)" }}
      >
        <div
          style={{
            ...card,
            textAlign: "center",
            maxWidth: 420,
            width: "100%",
            padding: 40,
          }}
        >
          <Loader2
            className="w-14 h-14 animate-spin mx-auto mb-5"
            style={{ color: "var(--accent-primary)" }}
          />
          <h2 className="text-xl font-bold mb-3 text-white">
            Connecting to scan...
          </h2>
        </div>
      </div>
    );
  }

  // Show progress if scan is running
  if (activeScanId && scanStatus) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ padding: "24px 28px", minHeight: "calc(100vh - 64px)" }}
      >
        <div
          style={{
            ...card,
            textAlign: "center",
            maxWidth: 420,
            width: "100%",
            padding: 40,
          }}
        >
          {scanStatus.status === "failed" ? (
            <>
              <AlertCircle
                className="w-14 h-14 mx-auto mb-5"
                style={{ color: "var(--red)" }}
              />
              <h2 className="text-xl font-bold mb-3 text-white">Scan Failed</h2>
              <p
                className="text-sm mb-6"
                style={{ color: "var(--text-secondary)" }}
              >
                {scanStatus.error_message || "Unknown error"}
              </p>
              <button
                onClick={() => setActiveScanId(null)}
                className="btn-secondary"
              >
                Try Again
              </button>
            </>
          ) : (
            <>
              <Loader2
                className="w-14 h-14 animate-spin mx-auto mb-5"
                style={{ color: "var(--accent-primary)" }}
              />
              <h2 className="text-xl font-bold mb-3 text-white">
                Scanning {scanStatus.target_ip}
              </h2>
              <p
                className="text-sm mb-8"
                style={{ color: "var(--text-secondary)" }}
              >
                {scanStatus.phase || "Initializing..."}
              </p>
              {/* Progress bar */}
              <div
                className="w-full rounded-full h-2.5 mb-3"
                style={{ background: "rgba(255, 255, 255, 0.08)" }}
              >
                <div
                  className="h-2.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${scanStatus.progress}%`,
                    background:
                      "linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))",
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {scanStatus.progress}%
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px" }}>
      <div className="max-w-xl mx-auto">
        {/* Header card */}
        <div style={card} className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-[13px] font-semibold uppercase tracking-[0.5px]"
                style={{ color: "var(--text-secondary)" }}
              >
                New Scan
              </span>
              <p
                className="text-sm mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                Discover network topology via SNMP, nmap, and ARP scanning.
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
              }}
            >
              <ScanSearch
                className="w-5 h-5"
                style={{ color: "var(--accent-primary)" }}
              />
            </div>
          </div>
        </div>

        {/* Form card */}
        <div style={card}>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Target IP */}
            <div>
              <label className="input-label">Target Device IP</label>
              <input
                type="text"
                value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)}
                placeholder="192.168.1.1"
                required
                className="input-field"
              />
              <p
                className="text-[11px] mt-1.5"
                style={{ color: "var(--text-faint)" }}
              >
                Primary device to query (firewall, router, or switch)
              </p>
            </div>

            {/* Subnets */}
            <div>
              <label className="input-label">Subnets to Scan</label>
              {subnets.map((subnet, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={subnet}
                    onChange={(e) => {
                      const updated = [...subnets];
                      updated[i] = e.target.value;
                      setSubnets(updated);
                    }}
                    placeholder="192.168.1.0/24"
                    className="input-field"
                  />
                  {subnets.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSubnets(subnets.filter((_, j) => j !== i))
                      }
                      className="px-3 rounded-xl border transition-colors flex items-center justify-center"
                      style={{
                        background: "rgba(3, 0, 20, 0.8)",
                        borderColor: "var(--border-subtle)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--red)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor =
                          "var(--border-subtle)";
                      }}
                    >
                      <Minus
                        className="w-4 h-4"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSubnets([...subnets, ""])}
                className="flex items-center gap-1.5 text-xs font-medium transition-colors mt-1"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--accent-primary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-secondary)";
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add subnet
              </button>
            </div>

            {/* SNMP */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">SNMP Community</label>
                <input
                  type="text"
                  value={snmpCommunity}
                  onChange={(e) => setSnmpCommunity(e.target.value)}
                  placeholder="public"
                  className="input-field"
                />
              </div>
              <div>
                <label className="input-label">SNMP Version</label>
                <select
                  value={snmpVersion}
                  onChange={(e) => setSnmpVersion(e.target.value)}
                  className="input-field"
                  style={{ cursor: "pointer" }}
                >
                  <option value="1">v1</option>
                  <option value="2c">v2c</option>
                  <option value="3">v3</option>
                </select>
              </div>
            </div>

            {/* Scan options */}
            <div>
              <label className="input-label">Scan Methods</label>
              <div className="flex gap-4 mt-2">
                {[
                  { label: "SNMP", checked: scanSnmp, onChange: setScanSnmp },
                  { label: "nmap", checked: scanNmap, onChange: setScanNmap },
                  { label: "ARP", checked: scanArp, onChange: setScanArp },
                ].map(({ label, checked, onChange }) => (
                  <label
                    key={label}
                    className="flex items-center gap-2.5 cursor-pointer select-none px-4 py-2.5 rounded-lg border transition-all"
                    style={{
                      background: checked
                        ? "rgba(6, 182, 212, 0.08)"
                        : "rgba(3, 0, 20, 0.5)",
                      borderColor: checked
                        ? "rgba(6, 182, 212, 0.4)"
                        : "var(--border-subtle)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onChange(e.target.checked)}
                      className="checkbox-accent"
                    />
                    <span
                      className="text-sm font-medium"
                      style={{
                        color: checked
                          ? "var(--text-primary)"
                          : "var(--text-secondary)",
                      }}
                    >
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!targetIp || startScan.isPending}
              className="btn-primary w-full"
              style={{ padding: "14px 24px", borderRadius: 12, fontSize: 15 }}
            >
              {startScan.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ScanSearch className="w-4 h-4" />
              )}
              Start Scan
            </button>

            {startScan.isError && (
              <p
                className="text-sm text-center"
                style={{ color: "var(--red)" }}
              >
                {(startScan.error as Error).message || "Failed to start scan"}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
