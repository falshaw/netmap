import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import {
  api,
  errorMessage,
  type ScanDiffData,
  type DeviceChange,
  type LinkChange,
} from "../services/api";
import { deviceType } from "../lib/devices";

const TONE = {
  added: { badge: "b-teal", label: "added", sign: "+" },
  removed: { badge: "b-red", label: "removed", sign: "−" },
  changed: { badge: "b-amber", label: "changed", sign: "~" },
} as const;

function DeviceRow({ device }: { device: DeviceChange }) {
  const tone = TONE[device.change_type];
  const info = deviceType(device.device_type);
  return (
    <li className="flex items-start gap-3 px-4 py-3 border-b border-line-2 last:border-0">
      <span className={`badge ${tone.badge} shrink-0 mt-0.5`}>{tone.label}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b className="font-mono font-medium text-[13px]">{device.ip_address}</b>
          {device.hostname && <span className="text-xs text-ink-65 truncate">{device.hostname}</span>}
        </div>
        <div className="text-xs text-ink-65">
          <span style={{ color: info.color }} className="font-semibold">{info.label}</span>
          {device.vendor ? ` · ${device.vendor}` : ""}
        </div>
        {device.changes && (
          <ul className="mt-1.5 grid gap-0.5">
            {Object.entries(device.changes).map(([field, ch]) => (
              <li key={field} className="text-xs font-mono">
                <span className="text-ink-65">{field}:</span>{" "}
                <span className="text-red">{ch.from || "none"}</span> →{" "}
                <span className="text-teal">{ch.to || "none"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function LinkRow({ link }: { link: LinkChange }) {
  const tone = TONE[link.change_type];
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 border-b border-line-2 last:border-0">
      <span className={`badge ${tone.badge} shrink-0`}>{tone.label}</span>
      <span className="font-mono text-[12.5px] truncate">
        {link.source_ip} ↔ {link.target_ip}
      </span>
      {link.discovery_method && (
        <span className="ml-auto text-[11px] font-mono text-ink-45 uppercase">{link.discovery_method}</span>
      )}
    </li>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 w-full px-4 py-3 text-left cursor-pointer"
      >
        {open ? <ChevronDown className="w-4 h-4 text-ink-45" aria-hidden /> : <ChevronRight className="w-4 h-4 text-ink-45" aria-hidden />}
        <h2>{title}</h2>
        <span className="badge b-grey">{count}</span>
      </button>
      {open && <ul className="border-t border-line">{children}</ul>}
    </section>
  );
}

export default function ScanDiff() {
  const { scanIdA = "", scanIdB = "" } = useParams<{ scanIdA: string; scanIdB: string }>();
  const a = parseInt(scanIdA, 10);
  const b = parseInt(scanIdB, 10);
  const valid = Number.isFinite(a) && Number.isFinite(b);

  const { data, isLoading, error } = useQuery<ScanDiffData>({
    queryKey: ["scanDiff", a, b],
    queryFn: () => api.compareScan(a, b),
    enabled: valid,
  });

  const head = (
    <div className="mb-5">
      <div className="eyebrow">
        <Link to="/history" className="hover:text-accent">History</Link> / Compare
      </div>
      <h1>Scan #{scanIdA} vs #{scanIdB}</h1>
    </div>
  );

  if (!valid || error) {
    return (
      <>
        {head}
        <div className="alert alert-error" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          {valid ? errorMessage(error, "Could not compare these scans") : "Those are not scan numbers."}
        </div>
        <Link to="/history" className="btn btn-ghost btn-sm mt-4">Back to history</Link>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        {head}
        <div className="flex items-center gap-2 text-ink-65" aria-busy="true">
          <Loader2 className="w-4 h-4 spin" aria-hidden /> Comparing scans…
        </div>
      </>
    );
  }

  const deviceChanges = data.devices_added.length + data.devices_removed.length + data.devices_changed.length;
  const links = [...data.links_added, ...data.links_removed, ...data.links_changed];

  return (
    <>
      {head}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Added", n: data.devices_added.length, c: "var(--teal)" },
          { label: "Removed", n: data.devices_removed.length, c: "var(--red)" },
          { label: "Changed", n: data.devices_changed.length, c: "var(--amber)" },
          { label: "Unchanged", n: data.devices_unchanged, c: "var(--ink-65)" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="eyebrow">{s.label} devices</div>
            <b className="block text-2xl mt-1" style={{ color: s.c }}>{s.n}</b>
          </div>
        ))}
      </div>

      {deviceChanges === 0 && links.length === 0 ? (
        <div className="alert alert-ok">
          No changes: both scans found the same {data.devices_unchanged} devices and{" "}
          {data.links_unchanged} links.
        </div>
      ) : (
        <div className="grid gap-4">
          <Section title="Added devices" count={data.devices_added.length}>
            {data.devices_added.map((d) => <DeviceRow key={d.ip_address} device={d} />)}
          </Section>
          <Section title="Removed devices" count={data.devices_removed.length}>
            {data.devices_removed.map((d) => <DeviceRow key={d.ip_address} device={d} />)}
          </Section>
          <Section title="Changed devices" count={data.devices_changed.length}>
            {data.devices_changed.map((d) => <DeviceRow key={d.ip_address} device={d} />)}
          </Section>
          <Section title="Link changes" count={links.length}>
            {links.map((l, i) => <LinkRow key={`${l.change_type}-${i}`} link={l} />)}
          </Section>
          <p className="text-xs text-ink-65">
            {data.devices_unchanged} unchanged devices · {data.links_unchanged} unchanged links
          </p>
        </div>
      )}
    </>
  );
}
