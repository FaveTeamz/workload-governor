import { useState, useEffect, useRef } from "react";

export interface ExportButtonProps {
  /** Wallet address shown in the print footer. */
  walletAddress?: string;
  className?: string;
}

export function ExportButton({ walletAddress: _walletAddress, className = "" }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function handlePrint() {
    setOpen(false);
    window.print();
  }

  function handlePDF() {
    setOpen(false);
    // PDF export uses the browser's built-in print-to-PDF
    window.print();
  }

  return (
    <div className={`export-btn-wrap${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm export-btn"
        aria-label="Export contributor profile"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">⬇</span> Export
      </button>

      {open && (
        <div className="export-dropdown" role="menu" aria-label="Export options">
          <button
            type="button"
            className="export-dropdown__item"
            role="menuitem"
            onClick={handlePrint}
          >
            🖨 Print
          </button>
          <button
            type="button"
            className="export-dropdown__item"
            role="menuitem"
            onClick={handlePDF}
          >
            📄 Download PDF
          </button>
        </div>
      )}
    </div>
  );
}
