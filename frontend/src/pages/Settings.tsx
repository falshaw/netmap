import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Wifi,
  Server,
  Key,
  Bell,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  Plug,
} from "lucide-react";
import {
  api,
  type SettingsData,
  type LLMTestResult,
} from "../services/api";

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

function SaveButton({
  onClick,
  saving,
  saved,
}: {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="btn-primary !py-2 !px-4 !text-xs"
    >
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : saved ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <Save className="w-3.5 h-3.5" />
      )}
      {saving ? "Saving..." : saved ? "Saved" : "Save"}
    </button>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  // SNMP form state
  const [snmpCommunity, setSnmpCommunity] = useState("");
  const [snmpVersion, setSnmpVersion] = useState("2c");
  const [snmpPort, setSnmpPort] = useState(161);
  const [snmpTimeout, setSnmpTimeout] = useState(5);
  const [snmpRetries, setSnmpRetries] = useState(2);

  // Scan preferences state
  const [scanNmap, setScanNmap] = useState(true);
  const [scanArp, setScanArp] = useState(true);
  const [scanSnmp, setScanSnmp] = useState(true);

  // API / LLM configuration state
  const [llmProvider, setLlmProvider] = useState("ollama");
  const [llmOllamaHost, setLlmOllamaHost] = useState("");
  const [llmOllamaModel, setLlmOllamaModel] = useState("");
  const [llmClaudeModel, setLlmClaudeModel] = useState("opus");
  const [testResult, setTestResult] = useState<LLMTestResult | null>(null);

  // Notification preferences state
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState("");
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [notifyOnFailed, setNotifyOnFailed] = useState(true);

  // Saved indicators
  const [snmpSaved, setSnmpSaved] = useState(false);
  const [scanSaved, setScanSaved] = useState(false);
  const [llmSaved, setLlmSaved] = useState(false);
  const [notifySaved, setNotifySaved] = useState(false);
  const snmpTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const llmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(snmpTimerRef.current);
      clearTimeout(scanTimerRef.current);
      clearTimeout(llmTimerRef.current);
      clearTimeout(notifyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (settings) {
      setSnmpCommunity(settings.snmp_community);
      setSnmpVersion(settings.snmp_version);
      setSnmpPort(settings.snmp_port);
      setSnmpTimeout(settings.snmp_timeout);
      setSnmpRetries(settings.snmp_retries);
      setScanNmap(settings.default_scan_nmap);
      setScanArp(settings.default_scan_arp);
      setScanSnmp(settings.default_scan_snmp);
      setLlmProvider(settings.llm_provider);
      setLlmOllamaHost(settings.llm_ollama_host);
      setLlmOllamaModel(settings.llm_ollama_model);
      setLlmClaudeModel(settings.llm_claude_model);
      setNotifyEnabled(settings.notify_enabled);
      setNotifyWebhookUrl(settings.notify_webhook_url);
      setNotifyOnComplete(settings.notify_on_scan_complete);
      setNotifyOnFailed(settings.notify_on_scan_failed);
    }
  }, [settings]);

  const snmpMutation = useMutation({
    mutationFn: (data: Partial<SettingsData>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSnmpSaved(true);
      clearTimeout(snmpTimerRef.current);
      snmpTimerRef.current = setTimeout(() => setSnmpSaved(false), 2000);
    },
  });

  const scanMutation = useMutation({
    mutationFn: (data: Partial<SettingsData>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setScanSaved(true);
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = setTimeout(() => setScanSaved(false), 2000);
    },
  });

  const llmMutation = useMutation({
    mutationFn: (data: Partial<SettingsData>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setLlmSaved(true);
      clearTimeout(llmTimerRef.current);
      llmTimerRef.current = setTimeout(() => setLlmSaved(false), 2000);
    },
  });

  const notifyMutation = useMutation({
    mutationFn: (data: Partial<SettingsData>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setNotifySaved(true);
      clearTimeout(notifyTimerRef.current);
      notifyTimerRef.current = setTimeout(() => setNotifySaved(false), 2000);
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      api.testLLMConnection({
        llm_provider: llmProvider,
        llm_ollama_host: llmOllamaHost,
        llm_ollama_model: llmOllamaModel,
        llm_claude_model: llmClaudeModel,
      }),
    onSuccess: (res) => setTestResult(res),
    onError: () =>
      setTestResult({
        ok: false,
        provider: llmProvider,
        model: "",
        detail: "Test request failed",
        model_available: null,
      }),
  });

  const saveSnmp = () => {
    snmpMutation.mutate({
      snmp_community: snmpCommunity,
      snmp_version: snmpVersion,
      snmp_port: snmpPort,
      snmp_timeout: snmpTimeout,
      snmp_retries: snmpRetries,
    });
  };

  const saveScan = () => {
    scanMutation.mutate({
      default_scan_nmap: scanNmap,
      default_scan_arp: scanArp,
      default_scan_snmp: scanSnmp,
    });
  };

  const saveLlm = () => {
    setTestResult(null);
    llmMutation.mutate({
      llm_provider: llmProvider,
      llm_ollama_host: llmOllamaHost,
      llm_ollama_model: llmOllamaModel,
      llm_claude_model: llmClaudeModel,
    });
  };

  const saveNotify = () => {
    notifyMutation.mutate({
      notify_enabled: notifyEnabled,
      notify_webhook_url: notifyWebhookUrl,
      notify_on_scan_complete: notifyOnComplete,
      notify_on_scan_failed: notifyOnFailed,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--accent-primary)" }}
        />
      </div>
    );
  }

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
              Settings
            </span>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              Application configuration and preferences
            </p>
          </div>
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
            }}
          >
            <SettingsIcon
              className="w-5 h-5"
              style={{ color: "var(--accent-primary)" }}
            />
          </div>
        </div>
      </div>

      {/* Settings grid */}
      <div
        className="grid gap-5 settings-grid"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        {/* SNMP Defaults */}
        <div style={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
                }}
              >
                <Wifi
                  className="w-4 h-4"
                  style={{ color: "var(--accent-primary)" }}
                />
              </div>
              <h3 className="text-[13px] font-semibold text-white">
                SNMP Defaults
              </h3>
            </div>
            <SaveButton
              onClick={saveSnmp}
              saving={snmpMutation.isPending}
              saved={snmpSaved}
            />
          </div>

          <div className="grid gap-3">
            <div>
              <label className="input-label">Community String</label>
              <input
                type="text"
                value={snmpCommunity}
                onChange={(e) => setSnmpCommunity(e.target.value)}
                className="input-field"
                placeholder="public"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Version</label>
                <select
                  value={snmpVersion}
                  onChange={(e) => setSnmpVersion(e.target.value)}
                  className="input-field"
                >
                  <option value="1">v1</option>
                  <option value="2c">v2c</option>
                  <option value="3">v3</option>
                </select>
              </div>
              <div>
                <label className="input-label">Port</label>
                <input
                  type="number"
                  value={snmpPort}
                  onChange={(e) => setSnmpPort(parseInt(e.target.value) || 161)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label">Timeout (sec)</label>
                <input
                  type="number"
                  value={snmpTimeout}
                  onChange={(e) =>
                    setSnmpTimeout(parseInt(e.target.value) || 5)
                  }
                  className="input-field"
                  min={1}
                  max={30}
                />
              </div>
              <div>
                <label className="input-label">Retries</label>
                <input
                  type="number"
                  value={snmpRetries}
                  onChange={(e) =>
                    setSnmpRetries(parseInt(e.target.value) || 2)
                  }
                  className="input-field"
                  min={0}
                  max={10}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Scan Preferences */}
        <div style={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
                }}
              >
                <Server
                  className="w-4 h-4"
                  style={{ color: "var(--accent-primary)" }}
                />
              </div>
              <h3 className="text-[13px] font-semibold text-white">
                Scan Preferences
              </h3>
            </div>
            <SaveButton
              onClick={saveScan}
              saving={scanMutation.isPending}
              saved={scanSaved}
            />
          </div>

          <p
            className="text-[12px] mb-4 leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Default scan methods used when starting a new scan. Can be
            overridden per-scan.
          </p>

          <div className="space-y-3">
            {[
              {
                id: "snmp",
                label: "SNMP Discovery",
                desc: "System info, interfaces, CDP/LLDP neighbors",
                checked: scanSnmp,
                toggle: setScanSnmp,
              },
              {
                id: "nmap",
                label: "nmap Port Scan",
                desc: "Host discovery, port scanning, OS fingerprinting",
                checked: scanNmap,
                toggle: setScanNmap,
              },
              {
                id: "arp",
                label: "ARP Scan",
                desc: "Layer 2 MAC address discovery (requires raw sockets)",
                checked: scanArp,
                toggle: setScanArp,
              },
            ].map(({ id, label, desc, checked, toggle }) => (
              <label
                key={id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                style={{
                  background: checked
                    ? "rgba(6, 182, 212, 0.05)"
                    : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggle(e.target.checked)}
                  className="checkbox-accent mt-0.5"
                />
                <div>
                  <div className="text-[13px] font-medium text-white">
                    {label}
                  </div>
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {desc}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* API Configuration */}
        <div style={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
                }}
              >
                <Key
                  className="w-4 h-4"
                  style={{ color: "var(--accent-primary)" }}
                />
              </div>
              <h3 className="text-[13px] font-semibold text-white">
                API Configuration
              </h3>
            </div>
            <SaveButton
              onClick={saveLlm}
              saving={llmMutation.isPending}
              saved={llmSaved}
            />
          </div>

          <p
            className="text-[12px] mb-4 leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            LLM provider for device enrichment. Ollama runs locally; Claude
            routes through the host CLI bridge.
          </p>

          <div className="grid gap-3">
            <div>
              <label className="input-label">Provider</label>
              <select
                value={llmProvider}
                onChange={(e) => {
                  setLlmProvider(e.target.value);
                  setTestResult(null);
                }}
                className="input-field"
              >
                <option value="ollama">Ollama (local)</option>
                <option value="claude">Claude (CLI bridge)</option>
              </select>
            </div>

            {llmProvider === "ollama" ? (
              <>
                <div>
                  <label className="input-label">Ollama Host</label>
                  <input
                    type="text"
                    value={llmOllamaHost}
                    onChange={(e) => setLlmOllamaHost(e.target.value)}
                    className="input-field"
                    placeholder="http://host.docker.internal:11434"
                  />
                </div>
                <div>
                  <label className="input-label">Ollama Model</label>
                  <input
                    type="text"
                    value={llmOllamaModel}
                    onChange={(e) => setLlmOllamaModel(e.target.value)}
                    className="input-field"
                    placeholder="qwen2.5:7b"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="input-label">Claude Model</label>
                <select
                  value={llmClaudeModel}
                  onChange={(e) => setLlmClaudeModel(e.target.value)}
                  className="input-field"
                >
                  <option value="haiku">haiku</option>
                  <option value="sonnet">sonnet</option>
                  <option value="opus">opus</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="btn-secondary !py-2 !px-4 !text-xs"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plug className="w-3.5 h-3.5" />
                )}
                {testMutation.isPending ? "Testing..." : "Test connection"}
              </button>
              {testResult && (
                <div
                  className="flex items-center gap-1.5 text-[12px]"
                  style={{
                    color: testResult.ok ? "var(--green)" : "var(--red)",
                  }}
                >
                  {testResult.ok ? (
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                  <span>{testResult.detail}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div style={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(124,58,237,0.2))",
                }}
              >
                <Bell
                  className="w-4 h-4"
                  style={{ color: "var(--accent-primary)" }}
                />
              </div>
              <h3 className="text-[13px] font-semibold text-white">
                Notifications
              </h3>
            </div>
            <SaveButton
              onClick={saveNotify}
              saving={notifyMutation.isPending}
              saved={notifySaved}
            />
          </div>

          <p
            className="text-[12px] mb-4 leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            POST a JSON payload to a webhook when a scan finishes. Works with
            Slack, Discord, and Mattermost incoming webhooks.
          </p>

          <div className="grid gap-3">
            <label
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
              style={{
                background: notifyEnabled
                  ? "rgba(6, 182, 212, 0.05)"
                  : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={notifyEnabled}
                onChange={(e) => setNotifyEnabled(e.target.checked)}
                className="checkbox-accent mt-0.5"
              />
              <div>
                <div className="text-[13px] font-medium text-white">
                  Enable notifications
                </div>
                <div
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Send webhook alerts for the selected scan events.
                </div>
              </div>
            </label>

            <div>
              <label className="input-label">Webhook URL</label>
              <input
                type="url"
                value={notifyWebhookUrl}
                onChange={(e) => setNotifyWebhookUrl(e.target.value)}
                className="input-field"
                placeholder="https://hooks.example.com/services/..."
                disabled={!notifyEnabled}
                style={{ opacity: notifyEnabled ? 1 : 0.5 }}
              />
              <p
                className="text-[11px] mt-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Stored encrypted at rest.
              </p>
            </div>

            <div className="space-y-2">
              {[
                {
                  id: "complete",
                  label: "Scan completed",
                  checked: notifyOnComplete,
                  toggle: setNotifyOnComplete,
                },
                {
                  id: "failed",
                  label: "Scan failed",
                  checked: notifyOnFailed,
                  toggle: setNotifyOnFailed,
                },
              ].map(({ id, label, checked, toggle }) => (
                <label
                  key={id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                  style={{
                    background:
                      checked && notifyEnabled
                        ? "rgba(6, 182, 212, 0.05)"
                        : "transparent",
                    opacity: notifyEnabled ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(e.target.checked)}
                    className="checkbox-accent"
                    disabled={!notifyEnabled}
                  />
                  <span className="text-[13px] font-medium text-white">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
