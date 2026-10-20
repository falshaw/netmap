import { useState, useRef, useEffect } from "react";
import { Download, FileCode2, Image, FileDown, ChevronDown, Loader2 } from "lucide-react";
import { api, errorMessage } from "../services/api";

interface ExportMenuProps {
  scanId: number;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

/** Overlays that belong to the UI, not to the diagram. */
const SKIP = ["react-flow__controls", "react-flow__minimap", "react-flow__attribution", "dev-panel", "topo-overlay"];

async function canvasPng(el: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");
  const bg = getComputedStyle(document.body).backgroundColor || "#eef2f7";
  return toPng(el, {
    backgroundColor: bg,
    pixelRatio: 2,
    filter: (node) =>
      !(node instanceof HTMLElement && SKIP.some((c) => node.classList.contains(c))),
  });
}

export default function ExportMenu({ scanId, canvasRef }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(kind: string, fn: () => Promise<void>) {
    setOpen(false);
    setError("");
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      setError(`${kind} export failed: ${errorMessage(err, "error")}`);
    } finally {
      setBusy(null);
    }
  }

  const drawio = () => run("draw.io", () => api.exportDrawio(scanId));

  const png = () =>
    run("PNG", async () => {
      if (!canvasRef.current) throw new Error("canvas not ready");
      const dataUrl = await canvasPng(canvasRef.current);
      const a = document.createElement("a");
      a.download = `netmap-scan-${scanId}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

  const pdf = () =>
    run("PDF", async () => {
      if (!canvasRef.current) throw new Error("canvas not ready");
      const dataUrl = await canvasPng(canvasRef.current);
      const img = new window.Image();
      img.src = dataUrl;
      await img.decode();
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: img.width >= img.height ? "landscape" : "portrait", unit: "px" });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const scale = Math.min(pw / img.width, ph / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      doc.addImage(dataUrl, "PNG", (pw - w) / 2, (ph - h) / 2, w, h);
      doc.save(`netmap-scan-${scanId}.pdf`);
    });

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-primary btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy !== null}
      >
        {busy ? <Loader2 className="w-4 h-4 spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
        {busy ? `Exporting ${busy}…` : "Export"}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={drawio}>
            <FileCode2 aria-hidden /> draw.io diagram (.drawio)
          </button>
          <button type="button" role="menuitem" onClick={png}>
            <Image aria-hidden /> PNG image of the canvas
          </button>
          <button type="button" role="menuitem" onClick={pdf}>
            <FileDown aria-hidden /> PDF of the canvas
          </button>
        </div>
      )}
      {error && (
        <p className="absolute right-0 top-[calc(100%+6px)] z-30 w-[260px] alert alert-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
