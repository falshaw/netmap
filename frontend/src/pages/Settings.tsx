import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, ScanSearch, Sparkles, Bell, Save, Loader2, Check, X, Plug, AlertCircle } from "lucide-react";
import {
  api,
  errorMessage,
  type SettingsData,
  type SettingsUpdate,
  type LLMTestResult,
} from "../services/api";
import SnmpV3Fields, { EMPTY_V3, v3Problem, type SnmpV3Value } from "../components/SnmpV3Fields";

/** One settings section with its own Save button and saved/failed state. */
function useSection(save: (data: SettingsUpdate) => Promise<SettingsData>) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mutation = useMutation({
    mutationFn: save,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 2500);
    },
  });
  return { mutation, saved };
}

function Card({
  icon: Icon,
  tone,
  title,
  desc,
  section,
  onSave,
  children,
}: {
  icon: typeof Radio;
  tone: string;
  title: string;
  desc?: string;
  section: ReturnType<typeof useSection>;
  onSave: () => void;
  children: React.ReactNode;
}) {
  const { mutation, saved } = section;
  return (
    <section className="card p-[18px] min-w-0" aria-label={title}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${tone}`} aria-hidden>
            <Icon className="w-4 h-4" />
          </span>
          <h2 className="truncate">{title}</h2>
        </div>
        <button type="button" onClick={onSave} disabled={mutation.isPending} className="btn btn-primary btn-sm shrink-0">
          {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 spin" aria-hidden /> : saved ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Save className="w-3.5 h-3.5" aria-hidden />}
          {mutation.isPending ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      {desc && <p className="text-[12.5px] text-ink-65 mb-4">{desc}</p>}
      {mutation.isError && (
        <div className="alert alert-error mb-3" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          {errorMessage(mutation.error, "Could not save")}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{saved ? `${title} saved` : ""}</span>
      {children}
    </section>
  );
}

export default function Settings() {
  const { data: settings, isLoading, isError } = useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [snmpCommunity, setSnmpCommunity] = useState("");
  const [snmpVersion, setSnmpVersion] = useState("2c");
  const [snmpPort, setSnmpPort] = useState(161);
  const [snmpTimeout, setSnmpTimeout] = useState(5);
  const [snmpRetries, setSnmpRetries] = useState(2);
  const [v3, setV3] = useState<SnmpV3Value>(EMPTY_V3);
  const [v3Error, setV3Error] = useState<string | null>(null);
  const [scanNmap, setScanNmap] = useState(true);
  const [scanArp, setScanArp] = useState(true);
  const [scanSnmp, setScanSnmp] = useState(true);
  const [llmProvider, setLlmProvider] = useState("ollama");
  const [llmOllamaHost, setLlmOllamaHost] = useState("");
  const [llmOllamaModel, setLlmOllamaModel] = useState("");
  const [llmClaudeModel, setLlmClaudeModel] = useState("sonnet");
  const [testResult, setTestResult] = useState<LLMTestResult | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState("");
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [notifyOnFailed, setNotifyOnFailed] = useState(true);

  useEffect(() => {
    if (!settings) return;
    setSnmpCommunity(settings.snmp_community);
    setSnmpVersion(settings.snmp_version);
    setSnmpPort(settings.snmp_port);
    setSnmpTimeout(settings.snmp_timeout);
    setSnmpRetries(settings.snmp_retries);
    // Passwords are write-only: the fields start empty, the placeholder says one is saved.
    setV3({
      ...EMPTY_V3,
      user: settings.snmp_v3_user,
      authProtocol: settings.snmp_v3_auth_protocol,
      privProtocol: settings.snmp_v3_priv_protocol,
    });
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
  }, [settings]);

  const snmp = useSection(api.updateSettings);
  const scan = useSection(api.updateSettings);
  const llm = useSection(api.updateSettings);
  const notify = useSection(api.updateSettings);

  const testMutation = useMutation({
    mutationFn: () =>
      api.testLLMConnection({
        llm_provider: llmProvider,
        llm_ollama_host: llmOllamaHost,
        llm_ollama_model: llmOllamaModel,
        llm_claude_model: llmClaudeModel,
      }),
    onMutate: () => setTestResult(null),
    onSuccess: (res) => setTestResult(res),
    onError: (err) =>
      setTestResult({
        ok: false,
        provider: llmProvider,
        model: "",
        detail: errorMessage(err, "Test request failed"),
        model_available: null,
      }),
  });

  const head = (
    <div className="mb-5">
      <div className="eyebrow">Configuration</div>
      <h1>Settings</h1>
      <p className="text-[13px] text-ink-65 mt-1">
        Defaults for new scans, the optional LLM provider and webhook
        notifications. Credentials are stored encrypted.
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {head}
        <div className="flex items-center gap-2 text-ink-65" aria-busy="true">
          <Loader2 className="w-4 h-4 spin" aria-hidden /> Loading settings…
        </div>
      </>
    );
  }
  if (isError) {
    return (
      <>
        {head}
        <div className="alert alert-error" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden /> Could not load settings.
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          icon={Radio}
          tone="bg-accent-soft text-accent"
          title="SNMP defaults"
          desc="Used when a scan does not set its own credentials or version. Timeout and retries apply to every SNMP request."
          section={snmp}
          onSave={() => {
            const saved = {
              auth: !!settings?.snmp_v3_auth_password_set,
              priv: !!settings?.snmp_v3_priv_password_set,
            };
            const problem = snmpVersion === "3" ? v3Problem(v3, saved) : null;
            setV3Error(problem);
            if (problem) return;
            const body: SettingsUpdate = {
              snmp_community: snmpCommunity,
              snmp_version: snmpVersion,
              snmp_port: snmpPort,
              snmp_timeout: snmpTimeout,
              snmp_retries: snmpRetries,
              snmp_v3_user: v3.user.trim(),
              snmp_v3_auth_protocol: v3.authProtocol,
              snmp_v3_priv_protocol: v3.privProtocol,
            };
            // No protocol = clear the stored password; blank = keep it.
            if (!v3.authProtocol) body.snmp_v3_auth_password = "";
            else if (v3.authPassword) body.snmp_v3_auth_password = v3.authPassword;
            if (!v3.privProtocol) body.snmp_v3_priv_password = "";
            else if (v3.privPassword) body.snmp_v3_priv_password = v3.privPassword;
            snmp.mutation.mutate(body);
          }}
        >
          <div className="grid gap-3">
            <div>
              <label className="label" htmlFor="s-community">Community string</label>
              <input id="s-community" className="input font-mono" value={snmpCommunity} onChange={(e) => setSnmpCommunity(e.target.value)} placeholder="public" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="s-version">Version</label>
                <select id="s-version" className="input" value={snmpVersion} onChange={(e) => setSnmpVersion(e.target.value)}>
                  <option value="1">v1</option>
                  <option value="2c">v2c</option>
                  <option value="3">v3</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="s-port">Port</label>
                <input id="s-port" type="number" className="input" value={snmpPort} min={1} max={65535} onChange={(e) => setSnmpPort(parseInt(e.target.value) || 161)} />
              </div>
              <div>
                <label className="label" htmlFor="s-timeout">Timeout (s)</label>
                <input id="s-timeout" type="number" className="input" value={snmpTimeout} min={1} max={30} onChange={(e) => setSnmpTimeout(parseInt(e.target.value) || 5)} />
              </div>
              <div>
                <label className="label" htmlFor="s-retries">Retries</label>
                <input id="s-retries" type="number" className="input" value={snmpRetries} min={0} max={10} onChange={(e) => setSnmpRetries(Number.isNaN(parseInt(e.target.value)) ? 2 : parseInt(e.target.value))} />
              </div>
            </div>
            {snmpVersion === "3" && (
              <SnmpV3Fields
                id="s-v3"
                value={v3}
                onChange={(next) => {
                  setV3(next);
                  setV3Error(null);
                }}
                savedAuth={!!settings?.snmp_v3_auth_password_set && !!v3.authProtocol}
                savedPriv={!!settings?.snmp_v3_priv_password_set && !!v3.privProtocol}
              />
            )}
            {v3Error && (
              <div className="alert alert-error" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                {v3Error}
              </div>
            )}
          </div>
        </Card>

        <Card
          icon={ScanSearch}
          tone="bg-teal-soft text-teal"
          title="Scan methods"
          desc="Ticked on the New scan form by default; each scan can change them."
          section={scan}
          onSave={() =>
            scan.mutation.mutate({
              default_scan_nmap: scanNmap,
              default_scan_arp: scanArp,
              default_scan_snmp: scanSnmp,
            })
          }
        >
          <div className="grid gap-2">
            {[
              { label: "SNMP discovery", desc: "System info, interfaces, CDP/LLDP neighbours", checked: scanSnmp, set: setScanSnmp },
              { label: "nmap", desc: "Live hosts and service ports", checked: scanNmap, set: setScanNmap },
              { label: "ARP", desc: "MAC addresses on the local segment (needs raw sockets)", checked: scanArp, set: setScanArp },
            ].map((m) => (
              <label key={m.label} className={`opt ${m.checked ? "on" : ""}`}>
                <input type="checkbox" checked={m.checked} onChange={(e) => m.set(e.target.checked)} />
                <span>
                  <b className="block text-[13.5px]">{m.label}</b>
                  <small className="text-[12px] text-ink-65">{m.desc}</small>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card
          icon={Sparkles}
          tone="bg-amber-soft text-amber"
          title="LLM provider"
          desc="Optional. Scanning, topology and export work without it; today only the connection test below uses it. Ollama runs locally; Claude goes through the host CLI bridge."
          section={llm}
          onSave={() => {
            setTestResult(null);
            llm.mutation.mutate({
              llm_provider: llmProvider,
              llm_ollama_host: llmOllamaHost,
              llm_ollama_model: llmOllamaModel,
              llm_claude_model: llmClaudeModel,
            });
          }}
        >
          <div className="grid gap-3">
            <div>
              <label className="label" htmlFor="l-provider">Provider</label>
              <select
                id="l-provider"
                className="input"
                value={llmProvider}
                onChange={(e) => {
                  setLlmProvider(e.target.value);
                  setTestResult(null);
                }}
              >
                <option value="ollama">Ollama (local)</option>
                <option value="claude">Claude (CLI bridge)</option>
              </select>
            </div>
            {llmProvider === "ollama" ? (
              <>
                <div>
                  <label className="label" htmlFor="l-host">Ollama host</label>
                  <input id="l-host" className="input font-mono" value={llmOllamaHost} onChange={(e) => setLlmOllamaHost(e.target.value)} placeholder="blank = OLLAMA_HOST from .env" autoComplete="off" />
                  <p className="hint">Blank = OLLAMA_HOST from .env.</p>
                </div>
                <div>
                  <label className="label" htmlFor="l-model">Ollama model</label>
                  <input id="l-model" className="input font-mono" value={llmOllamaModel} onChange={(e) => setLlmOllamaModel(e.target.value)} placeholder="blank = OLLAMA_MODEL from .env" autoComplete="off" />
                  <p className="hint">Must already be pulled on that host. Blank = OLLAMA_MODEL from .env.</p>
                </div>
              </>
            ) : (
              <div>
                <label className="label" htmlFor="l-claude">Claude model</label>
                <select id="l-claude" className="input" value={llmClaudeModel} onChange={(e) => setLlmClaudeModel(e.target.value)}>
                  <option value="haiku">haiku</option>
                  <option value="sonnet">sonnet</option>
                  <option value="opus">opus</option>
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} className="btn btn-ghost btn-sm">
                {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 spin" aria-hidden /> : <Plug className="w-3.5 h-3.5" aria-hidden />}
                {testMutation.isPending ? "Testing…" : "Test connection"}
              </button>
              <span className="text-xs text-ink-45">Tests what is on screen, saved or not.</span>
            </div>
            {testResult && (
              <div
                className={`alert ${!testResult.ok ? "alert-error" : testResult.model_available === false ? "alert-warn" : "alert-ok"}`}
                role="status"
              >
                {testResult.ok ? <Check className="w-4 h-4 shrink-0" aria-hidden /> : <X className="w-4 h-4 shrink-0" aria-hidden />}
                <span className="min-w-0 break-words">
                  <b>
                    {!testResult.ok ? "Failed" : testResult.model_available === false ? "Reachable, model missing" : "Connected"}
                  </b>
                  {testResult.model ? <> · <span className="font-mono">{testResult.model}</span></> : null}
                  <br />
                  {testResult.detail}
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card
          icon={Bell}
          tone="bg-red-soft text-red"
          title="Notifications"
          desc="POST a JSON payload to a webhook when a scan finishes. Works with Slack, Discord and Mattermost incoming webhooks."
          section={notify}
          onSave={() =>
            notify.mutation.mutate({
              notify_enabled: notifyEnabled,
              notify_webhook_url: notifyWebhookUrl,
              notify_on_scan_complete: notifyOnComplete,
              notify_on_scan_failed: notifyOnFailed,
            })
          }
        >
          <div className="grid gap-3">
            <label className={`opt ${notifyEnabled ? "on" : ""}`}>
              <input type="checkbox" checked={notifyEnabled} onChange={(e) => setNotifyEnabled(e.target.checked)} />
              <span>
                <b className="block text-[13.5px]">Enable notifications</b>
                <small className="text-[12px] text-ink-65">Send a webhook for the events ticked below.</small>
              </span>
            </label>
            <div>
              <label className="label" htmlFor="n-url">Webhook URL</label>
              <input
                id="n-url"
                type="url"
                className="input font-mono"
                value={notifyWebhookUrl}
                onChange={(e) => setNotifyWebhookUrl(e.target.value)}
                placeholder="https://hooks.example.com/services/…"
                disabled={!notifyEnabled}
                autoComplete="off"
              />
              <p className="hint">Stored encrypted at rest.</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                { label: "Scan completed", checked: notifyOnComplete, set: setNotifyOnComplete },
                { label: "Scan failed", checked: notifyOnFailed, set: setNotifyOnFailed },
              ].map((m) => (
                <label key={m.label} className={`inline-flex items-center gap-2 text-[13px] ${notifyEnabled ? "cursor-pointer" : "opacity-50"}`}>
                  <input type="checkbox" checked={m.checked} disabled={!notifyEnabled} onChange={(e) => m.set(e.target.checked)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
