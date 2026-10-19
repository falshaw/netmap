import { useState, useRef, useEffect } from "react";
import { Download, FileText, Image, FileDown, ChevronDown } from "lucide-react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { api } from "../services/api";

interface ExportMenuProps {
  scanId: number;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

export default function ExportMenu({ scanId, canvasRef }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleDrawio = async () => {
    try {
      await api.exportDrawio(scanId);
    } catch (err) {
      console.error("DrawIO export failed:", err);
    }
    setOpen(false);
  };

  const handlePng = async () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await toPng(canvasRef.current, {
        backgroundColor: "#030014",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `netmap-scan-${scanId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG export failed:", err);
    }
    setOpen(false);
  };

  const handlePdf = async () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await toPng(canvasRef.current, {
        backgroundColor: "#030014",
        pixelRatio: 2,
      });
      const pdf = new jsPDF({ orientation: "landscape", unit: "px" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const img = new window.Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const scale = Math.min(pageWidth / img.width, pageHeight / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (pageWidth - w) / 2;
      const y = (pageHeight - h) / 2;

      pdf.addImage(dataUrl, "PNG", x, y, w, h);
      pdf.save(`netmap-scan-${scanId}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
        style={{
          background: "rgba(3, 0, 20, 0.8)",
          borderColor: "var(--border-subtle)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
        Export
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-48 rounded-xl shadow-2xl overflow-hidden z-50"
          style={{
            background: "rgba(3, 0, 20, 0.95)",
            border: "1px solid var(--border-hover)",
            backdropFilter: "blur(10px)",
          }}
        >
          <button
            onClick={handleDrawio}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left"
          >
            <FileText className="w-3.5 h-3.5 text-[var(--cyan)]" />
            Download .drawio
          </button>
          <button
            onClick={handlePng}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left"
          >
            <Image className="w-3.5 h-3.5 text-[var(--green)]" />
            Download PNG
          </button>
          <button
            onClick={handlePdf}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left"
          >
            <FileDown className="w-3.5 h-3.5 text-[var(--red)]" />
            Download PDF
          </button>
        </div>
      )}
    </div>
  );
}
