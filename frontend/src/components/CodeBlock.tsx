import { Fragment, type ReactNode } from "react";

/** One "key = value" row of the dark data block; value null = comment line. */
export type CodeLine = { k: string; v?: string | number | null; comment?: boolean };

/**
 * Dark terminal-style block (dark in both themes) for raw stored data such as
 * SNMP system fields. Builds React nodes, never HTML strings.
 */
export function CodeBlock({
  lines,
  label,
  maxHeight,
}: {
  lines: CodeLine[];
  label?: string;
  maxHeight?: number;
}) {
  const width = Math.max(
    0,
    ...lines.filter((l) => !l.comment).map((l) => l.k.length),
  );
  const out: ReactNode[] = lines.map((l, i) => (
    <Fragment key={i}>
      {l.comment ? (
        <span className="c"># {l.k}</span>
      ) : (
        <>
          <span className="k">{l.k.padEnd(width)}</span> ={" "}
          <span className="s">{l.v == null || l.v === "" ? "-" : String(l.v)}</span>
        </>
      )}
      {i < lines.length - 1 && "\n"}
    </Fragment>
  ));
  return (
    <div className="min-w-0">
      {label && <div className="eyebrow mb-1.5">{label}</div>}
      <pre
        className="code m-0 !text-[12px] !whitespace-pre-wrap break-all"
        style={maxHeight ? { maxHeight } : undefined}
        tabIndex={0}
        aria-label={label ?? "Stored data"}
      >
        {out}
      </pre>
    </div>
  );
}
