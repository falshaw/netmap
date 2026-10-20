import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Search, Waypoints, Download, History } from "lucide-react";
import { AppBackground, LogoMark, Wordmark } from "../components/AppBackground";
import { ThemeToggle } from "../components/ThemeToggle";
import { isSignedIn, markSignedIn, safeNextPath } from "../lib/auth";

const FEATURES = [
  {
    icon: Search,
    title: "Three methods",
    text: "nmap, ARP sweep, SNMP v1, v2c and v3.",
    tone: "bg-accent-soft text-accent",
  },
  {
    icon: Waypoints,
    title: "Topology canvas",
    text: "Devices, links and subnets, layout saved per scan.",
    tone: "bg-teal-soft text-teal",
  },
  {
    icon: Download,
    title: "draw.io export",
    text: "Cisco shapes, plus PNG and PDF from the canvas.",
    tone: "bg-amber-soft text-amber",
  },
  {
    icon: History,
    title: "Scan history",
    text: "Compare two scans: added, removed, changed devices.",
    tone: "bg-red-soft text-red",
  },
];

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const expired = params.get("expired") === "1";

  if (isSignedIn() && !expired) {
    return <Navigate to={safeNextPath(params.get("next"))} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // nginx injects X-API-Key server-side, so the key typed here is sent in
      // X-Login-Key and compared by the API; a wrong key is rejected.
      const res = await fetch("/api/auth/validate", {
        method: "GET",
        headers: { "X-Login-Key": apiKey },
      });
      if (!res.ok) {
        setError(
          res.status === 401 || res.status === 403
            ? "Invalid API key"
            : `Sign-in failed (HTTP ${res.status})`,
        );
        return;
      }
      markSignedIn();
      navigate(safeNextPath(params.get("next")), { replace: true });
    } catch {
      setError("Cannot reach the NetMap API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AppBackground />
      <ThemeToggle className="fixed top-4 right-4 z-20" />

      <div className="mx-auto grid min-h-screen max-w-[1180px] gap-6 p-4 pt-16 lg:grid-cols-[1.2fr_1fr] lg:px-6 lg:py-8">
        <section className="glass flex flex-col !rounded-3xl p-[22px] lg:px-[34px] lg:py-[30px]">
          <div className="flex items-center gap-2.5 text-base font-bold">
            <LogoMark size={38} />
            <Wordmark />
          </div>

          <div className="my-auto max-w-[460px] py-6 lg:py-10">
            <div className="eyebrow !text-accent mb-3">Network discovery</div>
            <h1 className="!text-[30px] lg:!text-[34px] !leading-[1.12] !tracking-[-0.03em]">
              Scan the network,
              <br />
              <span className="accent-text">draw the map.</span>
            </h1>
            <p className="mt-3.5 text-[15px] text-ink-65">
              Discovers hosts with nmap and ARP, walks SNMP for neighbours,
              VLANs and routes, and builds a topology you can export to
              draw.io. Runs locally.
            </p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="card flex gap-3 !rounded-2xl p-3.5">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${f.tone}`}
                    aria-hidden
                  >
                    <f.icon className="h-4 w-4" />
                  </span>
                  <span>
                    <b className="block text-[13.5px] font-semibold">{f.title}</b>
                    <small className="text-[12.5px] text-ink-65">{f.text}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-[18px] text-[11.5px] text-ink-65">
            {[
              ["var(--ink-45)", "Runs locally"],
              ["var(--accent)", "MIT licensed"],
              ["var(--teal)", "Credentials encrypted"],
            ].map(([c, t]) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: c }}
                  aria-hidden
                />
                {t}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center justify-center pb-8 lg:p-6">
          <div className="w-full max-w-[340px]">
            <form
              onSubmit={handleSubmit}
              className="glass !rounded-3xl px-7 py-[30px]"
            >
              <h1 className="!text-[22px]">Sign in</h1>
              <div className="mt-0.5 mb-[22px] text-[13px] text-ink-65">
                Enter the API key from your .env
              </div>

              {expired && !error && (
                <p className="alert alert-warn mb-3" role="status">
                  Your session ended. Sign in again.
                </p>
              )}

              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45"
                  aria-hidden
                />
                <input
                  id="apiKey"
                  className="input input-glass !pl-10"
                  type="password"
                  placeholder="API key"
                  aria-label="API key"
                  autoComplete="current-password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {error && (
                <p className="mt-3 text-[13px] font-medium text-red" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!apiKey || loading}
                className="btn btn-primary mt-5 !h-[46px] w-full shadow-[0_8px_22px_rgba(37,99,235,0.35)]"
              >
                {loading ? "Checking…" : "Sign in"}
              </button>

              <div
                className="code mt-[22px] !rounded-[14px] !px-3.5 !py-3 !text-xs !whitespace-pre-wrap break-words"
                aria-label="Example API call"
              >
                <span className="k">$</span> curl{" "}
                <span className="s">-H "X-API-Key: $API_KEY"</span> \{"\n"}
                {"  "}127.0.0.1:8021/api/stats{"\n"}
                <span className="c">{'{"total_scans": …, "total_devices": …}'}</span>
              </div>
            </form>
            <div className="mt-[18px] text-center text-[11.5px] text-ink-45">
              Open source · github.com/falshaw/netmap
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
