export interface SnmpV3Value {
  user: string;
  authProtocol: string;
  authPassword: string;
  privProtocol: string;
  privPassword: string;
}

export const EMPTY_V3: SnmpV3Value = {
  user: "",
  authProtocol: "",
  authPassword: "",
  privProtocol: "",
  privPassword: "",
};

const AUTH = [
  { value: "", label: "None (noAuthNoPriv)" },
  { value: "md5", label: "MD5" },
  { value: "sha", label: "SHA-1" },
  { value: "sha224", label: "SHA-224" },
  { value: "sha256", label: "SHA-256" },
];

const PRIV = [
  { value: "", label: "None (authNoPriv)" },
  { value: "des", label: "DES" },
  { value: "3des", label: "3DES" },
  { value: "aes", label: "AES-128" },
  { value: "aes192", label: "AES-192" },
  { value: "aes256", label: "AES-256" },
];

/** Why these credentials cannot work, or null. Mirrors the API's check. */
export function v3Problem(
  v: SnmpV3Value,
  saved: { auth: boolean; priv: boolean } = { auth: false, priv: false },
): string | null {
  if (!v.user.trim()) return "SNMPv3 needs a user name.";
  if (v.authProtocol && !v.authPassword && !saved.auth) return "Enter the auth password.";
  if (v.privProtocol && !v.privPassword && !saved.priv) return "Enter the privacy password.";
  if (v.privProtocol && !v.authProtocol) return "Privacy (encryption) needs an auth protocol as well.";
  if ((v.authPassword && v.authPassword.length < 8) || (v.privPassword && v.privPassword.length < 8))
    return "SNMPv3 passwords must be at least 8 characters.";
  return null;
}

/**
 * SNMPv3 USM user, auth and privacy. Passwords are write-only: when one is
 * already stored, the field stays empty and its placeholder says so.
 */
export default function SnmpV3Fields({
  id,
  value,
  onChange,
  savedAuth = false,
  savedPriv = false,
  savedLabel = "saved, leave blank to keep",
}: {
  id: string;
  value: SnmpV3Value;
  onChange: (next: SnmpV3Value) => void;
  savedAuth?: boolean;
  savedPriv?: boolean;
  savedLabel?: string;
}) {
  const set = (patch: Partial<SnmpV3Value>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="grid gap-3">
      <legend className="label">SNMPv3 credentials</legend>
      <div>
        <label className="label" htmlFor={`${id}-user`}>User name</label>
        <input
          id={`${id}-user`}
          className="input font-mono"
          value={value.user}
          onChange={(e) => set({ user: e.target.value })}
          placeholder="netmap-ro"
          autoComplete="off"
          maxLength={100}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-auth`}>Auth protocol</label>
          <select
            id={`${id}-auth`}
            className="input"
            value={value.authProtocol}
            onChange={(e) =>
              set(
                e.target.value
                  ? { authProtocol: e.target.value }
                  : { authProtocol: "", authPassword: "", privProtocol: "", privPassword: "" },
              )
            }
          >
            {AUTH.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-authpw`}>Auth password</label>
          <input
            id={`${id}-authpw`}
            type="password"
            className="input font-mono"
            value={value.authPassword}
            onChange={(e) => set({ authPassword: e.target.value })}
            placeholder={savedAuth ? savedLabel : "8+ characters"}
            disabled={!value.authProtocol}
            autoComplete="new-password"
            maxLength={200}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-priv`}>Privacy protocol</label>
          <select
            id={`${id}-priv`}
            className="input"
            value={value.privProtocol}
            onChange={(e) =>
              set(e.target.value ? { privProtocol: e.target.value } : { privProtocol: "", privPassword: "" })
            }
            disabled={!value.authProtocol}
          >
            {PRIV.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-privpw`}>Privacy password</label>
          <input
            id={`${id}-privpw`}
            type="password"
            className="input font-mono"
            value={value.privPassword}
            onChange={(e) => set({ privPassword: e.target.value })}
            placeholder={savedPriv ? savedLabel : "8+ characters"}
            disabled={!value.privProtocol}
            autoComplete="new-password"
            maxLength={200}
          />
        </div>
      </div>
    </fieldset>
  );
}
