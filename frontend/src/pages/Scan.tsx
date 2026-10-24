import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScanSearch, Loader2, AlertCircle, Plus, X } from "lucide-react";
import {
  api,
  errorMessage,
  type ScanResponse,
  type SettingsData,
} from "../services/api";
import SnmpV3Fields, { EMPTY_V3, v3Problem, type SnmpV3Value } from "../components/SnmpV3Fields";

const METHODS = [
  { key: "snmp", label: "SNMP", desc: "System info, interfaces, CDP/LLDP neighbours, routes, VLANs" },
  { key: "nmap", label: "nmap", desc: "Live hosts and service ports" },
  { key: "arp", label: "ARP", desc: "MAC addresses on the local segment (needs raw sockets)" },
] as const;

type MethodKey = (typeof METHODS)[number]["key"];

function ScanProgress({
  scan,
  onRetry,
}: {
  scan: ScanResponse | undefined;
  onRetry: () => void;
}) {
  if (!scan) {
    return (
      <div className="card p-8 text-center max-w-[460px] mx-auto">
        <Loader2 className="w-10 h-10 spin mx-auto mb-4 text-accent" aria-hidden />
        <h2 className="!text-lg">Connecting to scan…</h2>
      </div>
    );
  }
  if (scan.status === "failed") {
    return (
      <div className="card p-8 text-center max-w-[460px] mx-auto" role="alert">
        <AlertCircle className="w-10 h-10 mx-auto mb-4 text-red" aria-hidden />
        <h2 className="!text-lg">Scan #{scan.id} failed</h2>
        <p className="text-[13px] text-ink-65 mt-2">{scan.error_message || "Unknown error"}</p>
        <div className="flex gap-2 justify-center mt-6">
          <button type="button" onClick={onRetry} className="btn btn-primary btn-sm">
            Try again
          </button>
          <Link to="/history" className="btn btn-ghost btn-sm">History</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card p-8 max-w-[460px] mx-auto" aria-live="polite">
      <div className="flex items-center gap-3 mb-5">
        <Loader2 className="w-6 h-6 spin text-accent shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="!text-lg">Scanning {scan.target_ip}</h2>
          <p className="text-[13px] text-ink-65">
            Scan #{scan.id} · {scan.phase || "Starting…"}
          </p>
        </div>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scan.progress}
        aria-label="Scan progress"
      >
        <b style={{ width: `${scan.progress}%` }} />
      </div>
      <p className="text-xs text-ink-65 mt-2 text-right font-mono">{scan.progress}%</p>
      <p className="hint">The topology opens when the scan completes.</p>
    </div>
  );
}

export default function ScanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const pollParam = searchParams.get("poll");
  const parsedPoll = pollParam ? parseInt(pollParam, 10) : NaN;
  const activeScanId = Number.isFinite(parsedPoll) ? parsedPoll : null;

  const [targetIp, setTargetIp] = useState("");
  const [subnets, setSubnets] = useState([""]);
  const [snmpCommunity, setSnmpCommunity] = useState("");
  const [snmpVersion, setSnmpVersion] = useState("2c");
  const [v3, setV3] = useState<SnmpV3Value>(EMPTY_V3);
  const [methods, setMethods] = useState<Record<MethodKey, boolean>>({
    snmp: true,
    nmap: true,
    arp: true,
  });
  const [prefilled, setPrefilled] = useState(false);

  // Start from the defaults saved on the Settings page.
  const { data: settings } = useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });
  useEffect(() => {
    if (settings && !prefilled) {
      setSnmpCommunity(settings.snmp_community);
      setSnmpVersion(settings.snmp_version);
      setV3({
        ...EMPTY_V3,
        user: settings.snmp_v3_user,
        authProtocol: settings.snmp_v3_auth_protocol,
        privProtocol: settings.snmp_v3_priv_protocol,
      });
      setMethods({
        snmp: settings.default_scan_snmp,
        nmap: settings.default_scan_nmap,
        arp: settings.default_scan_arp,
      });
      setPrefilled(true);
    }
  }, [settings, prefilled]);

  const { data: scanStatus } = useQuery<ScanResponse>({
    queryKey: ["scan", activeScanId],
    queryFn: () => api.getScan(activeScanId!),
    enabled: activeScanId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "completed" || s === "failed" ? false : 2000;
    },
  });

  useEffect(() => {
    if (scanStatus?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      navigate(`/topology/${scanStatus.id}`, { replace: true });
    } else if (scanStatus?.status === "failed") {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    }
  }, [scanStatus, navigate, queryClient]);

  const startScan = useMutation({
    mutationFn: api.createScan,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      setSearchParams({ poll: String(data.id) });
    },
  });

  const isV3 = snmpVersion === "3";
  const savedV3 = {
    auth: !!settings?.snmp_v3_auth_password_set,
    priv: !!settings?.snmp_v3_priv_password_set,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startScan.mutate({
      target_ip: targetIp.trim(),
      subnets: subnets.map((s) => s.trim()).filter(Boolean),
      // Blank = let the API use the community saved in Settings.
      snmp_community: isV3 ? undefined : snmpCommunity || undefined,
      snmp_version: snmpVersion,
      ...(isV3 && {
        snmp_v3_user: v3.user.trim(),
        snmp_v3_auth_protocol: v3.authProtocol,
        snmp_v3_priv_protocol: v3.privProtocol,
        // A blank password = the one saved in Settings; no protocol = none.
        snmp_v3_auth_password: v3.authProtocol ? v3.authPassword || undefined : "",
        snmp_v3_priv_password: v3.privProtocol ? v3.privPassword || undefined : "",
      }),
      scan_nmap: methods.nmap,
      scan_arp: methods.arp,
      scan_snmp: methods.snmp,
    });
  };

  const noMethod = !methods.snmp && !methods.nmap && !methods.arp;
  const v3Error = methods.snmp && isV3 ? v3Problem(v3, savedV3) : null;
  const needsSubnet =
    (methods.nmap || methods.arp) && subnets.every((s) => !s.trim());

  return (
    <>
      <div className="mb-5">
        <div className="eyebrow">Discovery</div>
        <h1>New scan</h1>
        <p className="text-[13px] text-ink-65 mt-1">
          Point NetMap at a seed device and the subnets to walk. Only scan
          networks you own or are authorised to scan.
        </p>
      </div>

      {activeScanId !== null ? (
        <ScanProgress scan={scanStatus} onRetry={() => setSearchParams({})} />
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4 max-w-[720px]">
          <section className="card p-[18px] grid gap-4">
            <div>
              <label className="label" htmlFor="target">Seed device IP</label>
              <input
                id="target"
                className="input font-mono"
                value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)}
                placeholder="192.168.1.1"
                required
                inputMode="decimal"
                autoComplete="off"
              />
              <p className="hint">The router, firewall or switch SNMP is queried on.</p>
            </div>

            <div>
              <span className="label" id="subnets-label">Subnets to scan</span>
              <div className="grid gap-2" role="group" aria-labelledby="subnets-label">
                {subnets.map((subnet, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="input font-mono"
                      value={subnet}
                      onChange={(e) => {
                        const next = [...subnets];
                        next[i] = e.target.value;
                        setSubnets(next);
                      }}
                      placeholder="192.168.1.0/24"
                      aria-label={`Subnet ${i + 1}`}
                      autoComplete="off"
                    />
                    {subnets.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost !px-3"
                        onClick={() => setSubnets(subnets.filter((_, j) => j !== i))}
                        aria-label={`Remove subnet ${i + 1}`}
                      >
                        <X className="w-4 h-4" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSubnets([...subnets, ""])}
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden /> Add subnet
              </button>
            </div>
          </section>

          <section className="card p-[18px] grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {!isV3 && (
                <div>
                  <label className="label" htmlFor="community">SNMP community</label>
                  <input
                    id="community"
                    className="input font-mono"
                    value={snmpCommunity}
                    onChange={(e) => setSnmpCommunity(e.target.value)}
                    placeholder="from Settings"
                    autoComplete="off"
                  />
                </div>
              )}
              <div>
                <label className="label" htmlFor="version">SNMP version</label>
                <select
                  id="version"
                  className="input"
                  value={snmpVersion}
                  onChange={(e) => setSnmpVersion(e.target.value)}
                >
                  <option value="1">v1</option>
                  <option value="2c">v2c</option>
                  <option value="3">v3</option>
                </select>
              </div>
            </div>

            {isV3 && (
              <SnmpV3Fields
                id="v3"
                value={v3}
                onChange={setV3}
                savedAuth={savedV3.auth && !!v3.authProtocol}
                savedPriv={savedV3.priv && !!v3.privProtocol}
                savedLabel="from Settings"
              />
            )}

            <fieldset>
              <legend className="label">Scan methods</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {METHODS.map((m) => (
                  <label key={m.key} className={`opt ${methods[m.key] ? "on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={methods[m.key]}
                      onChange={(e) => setMethods({ ...methods, [m.key]: e.target.checked })}
                    />
                    <span>
                      <b className="block text-[13.5px]">{m.label}</b>
                      <small className="text-[12px] text-ink-65">{m.desc}</small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="hint">Defaults come from Settings. In bridge mode (Docker default) ARP is skipped.</p>
            </fieldset>
          </section>

          {startScan.isError && (
            <div className="alert alert-error" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
              {errorMessage(startScan.error, "Could not start the scan")}
            </div>
          )}
          {v3Error && <p className="text-[13px] text-amber-ink">{v3Error}</p>}
          {needsSubnet && (
            <p className="text-[13px] text-amber-ink">nmap and ARP need at least one subnet.</p>
          )}

          <div>
            <button
              type="submit"
              disabled={!targetIp.trim() || noMethod || !!v3Error || startScan.isPending}
              className="btn btn-primary"
            >
              {startScan.isPending ? (
                <Loader2 className="w-4 h-4 spin" aria-hidden />
              ) : (
                <ScanSearch className="w-4 h-4" aria-hidden />
              )}
              Start scan
            </button>
          </div>
        </form>
      )}
    </>
  );
}
