/**
 * ShortcutHintBanner — closes #281 (first-visit tooltip requirement)
 *
 * Shown once after the user's first visit. Dismissed permanently via a button
 * or automatically after 8 seconds. Stores the dismissed state in localStorage.
 */
import { useState, useEffect } from "react";

const BANNER_STORAGE_KEY = "wg_shortcut_hint_dismissed";

interface Props {
  onShowHelp: () => void;
}

export function ShortcutHintBanner({ onShowHelp }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show on first visit (no prior dismissal).
    if (!localStorage.getItem(BANNER_STORAGE_KEY)) {
      setVisible(true);
      // Auto-dismiss after 8 seconds.
      const timer = setTimeout(() => dismiss(), 8000);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(BANNER_STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="shortcut-banner"
      role="status"
      aria-live="polite"
      aria-label="Keyboard shortcuts hint"
    >
      <span className="shortcut-banner__text">
        ⌨ Power user? Press <kbd className="shortcut-kbd">?</kbd> to see all keyboard shortcuts.
      </span>
      <button
        className="shortcut-banner__dismiss"
        onClick={dismiss}
        aria-label="Dismiss keyboard shortcut hint"
      >
        ✕
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => { dismiss(); onShowHelp(); }}
        aria-label="Show keyboard shortcuts"
      >
        Show
      </button>
    </div>
  );
}
