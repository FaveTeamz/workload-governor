/**
 * ShortcutHelpModal — closes #281
 *
 * Displays all registered keyboard shortcuts in a focusable, accessible dialog.
 * Opens via the "?" key or a trigger button in the header.
 * Closes via the "?" key, Escape, or the ✕ button.
 */
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { SHORTCUT_DESCRIPTORS } from "../hooks/useKeyboardShortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelpModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef  = useRef<HTMLButtonElement>(null);

  // Trap focus and focus the close button when the modal opens.
  useEffect(() => {
    if (open) {
      // Small delay to let the DOM settle after display change.
      const timer = setTimeout(() => closeRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Trap Tab focus inside dialog.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button, a, [tabindex]"
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="shortcut-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="shortcut-dialog" ref={dialogRef}>
        <div className="shortcut-dialog__header">
          <h2 id="shortcut-dialog-title">Keyboard Shortcuts</h2>
          <button
            ref={closeRef}
            className="shortcut-dialog__close"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            ✕
          </button>
        </div>

        <table className="shortcut-table" aria-label="Shortcut reference table">
          <thead>
            <tr>
              <th scope="col">Keys</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUT_DESCRIPTORS.map(({ keys, label }) => (
              <tr key={label}>
                <td className="shortcut-table__keys">
                  {keys.map((k, i) => (
                    <span key={i}>
                      <kbd className="shortcut-kbd">{k}</kbd>
                      {i < keys.length - 1 && (
                        <span className="shortcut-then" aria-label="then"> then </span>
                      )}
                    </span>
                  ))}
                </td>
                <td className="shortcut-table__label">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="shortcut-dialog__note">
          Shortcuts are disabled while typing in any text field.
        </p>
      </div>
    </div>
  );
}

/** Small "?" trigger button intended for the app header. */
export function ShortcutHintButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn btn-ghost shortcut-hint-btn"
      onClick={onClick}
      aria-label="Show keyboard shortcuts (press ? at any time)"
      title="Keyboard shortcuts (?)"
    >
      <kbd className="shortcut-kbd" aria-hidden="true">?</kbd>
    </button>
  );
}
