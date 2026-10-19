import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map, KeyRound, Loader2 } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validate via GET — nginx injects the X-API-Key header server-side.
      // (The backend's POST validate route was removed during hardening because
      // it bypassed the require_api_key dependency, so GET is the only path.)
      const res = await fetch("/api/auth/validate", { method: "GET" });

      if (!res.ok) {
        setError("Invalid API key");
        setLoading(false);
        return;
      }

      // Mark as authenticated (key is injected server-side by nginx)
      sessionStorage.setItem("netmap_authenticated", "1");
      navigate("/dashboard");
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: `
          radial-gradient(ellipse at 30% 20%, rgba(124, 58, 237, 0.2) 0%, transparent 50%),
          radial-gradient(ellipse at 70% 80%, rgba(6, 182, 212, 0.15) 0%, transparent 50%),
          #030014
        `,
      }}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="gradient-icon mx-auto mb-6"
            style={{ width: 64, height: 64, borderRadius: 18 }}
          >
            <Map className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Net
            <span
              style={{
                background: "var(--gradient-brand)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Map
            </span>
          </h1>
          <p className="mt-2" style={{ color: "var(--text-muted)" }}>
            Enter your API key to continue
          </p>
        </div>

        {/* Login Card */}
        <div
          className="p-10"
          style={{
            background: "rgba(17, 8, 48, 0.8)",
            border: "1px solid rgba(6, 182, 212, 0.3)",
            borderRadius: 20,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "var(--red)",
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label className="input-label" htmlFor="apiKey">
                API Key
              </label>
              <div className="relative">
                <KeyRound
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--text-faint)" }}
                />
                <input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  required
                  className="input-field"
                  style={{ paddingLeft: 44 }}
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!apiKey || loading}
              className="btn-primary w-full"
              style={{ padding: "14px 24px", fontSize: 15, borderRadius: 10 }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {loading ? "Verifying..." : "Sign In"}
            </button>
          </form>
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "var(--text-faint)" }}
        >
          NetMap &mdash; Network Diagram Generator
        </p>
      </div>
    </div>
  );
}
