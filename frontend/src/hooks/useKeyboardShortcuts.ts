/**
 * useKeyboardShortcuts — closes #281
 *
 * Registers global keyboard shortcuts for power-user navigation.
 * All shortcuts are suppressed when focus is inside a text input/textarea/select
 * or inside a contenteditable element to avoid conflicting with typing.
 *
 * Shortcut map:
 *   J        — focus next item in the active list
 *   K        — focus previous item in the active list
 *   Enter    — open apply modal on focused issue card
 *   Escape   — close any open modal
 *   /        — focus the search input
 *   G then O — open org selector (sequence within 1 second)
 *   ?        — open shortcut help modal
 */
import { useEffect, useRef, useCallback } from "react";

/** A single shortcut descriptor for display in the help modal. */
export interface ShortcutDescriptor {
  keys: string[];   // e.g. ["J"] or ["G", "O"]
  label: string;
}

export const SHORTCUT_DESCRIPTORS: ShortcutDescriptor[] = [
  { keys: ["J"],    label: "Focus next item" },
  { keys: ["K"],    label: "Focus previous item" },
  { keys: ["Enter"],label: "Open apply modal on focused issue" },
  { keys: ["Esc"],  label: "Close any open modal" },
  { keys: ["/"],    label: "Focus search input" },
  { keys: ["G", "O"], label: "Open org selector" },
  { keys: ["?"],    label: "Show / hide this help panel" },
];

/** Focusable selector scoped to the issue list. */
const ISSUE_CARD_SELECTOR = "[data-shortcut-item]";
const SEARCH_SELECTOR     = "[data-shortcut-search]";
const ORG_SELECTOR        = "[data-shortcut-org]";

/** Returns true when keyboard focus is inside a text-entry element. */
function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el as HTMLElement).tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export interface UseKeyboardShortcutsOptions {
  /** Called to request that any open modal be closed. */
  onEscape?: () => void;
  /** Called to open the apply modal for the currently focused item. */
  onEnter?: (el: HTMLElement) => void;
  /** Called to toggle the shortcut help modal. */
  onHelp?: () => void;
  /** Called to open the org selector. */
  onOrgSelector?: () => void;
  /** Enabled/disabled master switch. */
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onEscape,
  onEnter,
  onHelp,
  onOrgSelector,
  enabled = true,
}: UseKeyboardShortcutsOptions = {}) {
  /**
   * Track a pending "G" key so we can detect the "G then O" sequence.
   * We store the timeout id so we can clear it if no follow-up key arrives
   * within 1 second.
   */
  const pendingGRef = useRef(false);
  const pendingGTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingG = useCallback(() => {
    pendingGRef.current = false;
    if (pendingGTimerRef.current !== null) {
      clearTimeout(pendingGTimerRef.current);
      pendingGTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when modifier keys are held (avoid browser shortcut conflicts).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // If the user is typing in an input, only handle Escape.
      if (isTyping()) {
        if (e.key === "Escape") {
          onEscape?.();
          clearPendingG();
        }
        return;
      }

      // Handle "G then O" sequence.
      if (pendingGRef.current) {
        clearPendingG();
        if (e.key === "o" || e.key === "O") {
          e.preventDefault();
          // Focus the org selector element or call the callback.
          const orgEl = document.querySelector<HTMLElement>(ORG_SELECTOR);
          if (orgEl) {
            orgEl.focus();
          } else {
            onOrgSelector?.();
          }
          return;
        }
        // Any other key cancels the sequence.
      }

      switch (e.key) {
        case "j":
        case "J": {
          e.preventDefault();
          moveFocus(1);
          break;
        }
        case "k":
        case "K": {
          e.preventDefault();
          moveFocus(-1);
          break;
        }
        case "Enter": {
          const focused = document.activeElement as HTMLElement | null;
          if (focused?.closest(ISSUE_CARD_SELECTOR)) {
            e.preventDefault();
            onEnter?.(focused.closest(ISSUE_CARD_SELECTOR) as HTMLElement);
          }
          break;
        }
        case "Escape": {
          clearPendingG();
          onEscape?.();
          break;
        }
        case "/": {
          e.preventDefault();
          const searchEl = document.querySelector<HTMLElement>(SEARCH_SELECTOR);
          searchEl?.focus();
          break;
        }
        case "g":
        case "G": {
          e.preventDefault();
          pendingGRef.current = true;
          // Cancel sequence if no follow-up within 1 second.
          pendingGTimerRef.current = setTimeout(clearPendingG, 1000);
          break;
        }
        case "?": {
          e.preventDefault();
          onHelp?.();
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearPendingG();
    };
  }, [enabled, onEscape, onEnter, onHelp, onOrgSelector, clearPendingG]);
}

/**
 * Move focus to the next/previous item in the issue list.
 * direction = 1 for down (J), -1 for up (K).
 */
function moveFocus(direction: 1 | -1) {
  const items = Array.from(
    document.querySelectorAll<HTMLElement>(ISSUE_CARD_SELECTOR)
  );
  if (items.length === 0) return;

  const currentIndex = items.findIndex((el) => el.contains(document.activeElement));

  let nextIndex: number;
  if (currentIndex === -1) {
    // Nothing focused yet — start at the top or bottom.
    nextIndex = direction === 1 ? 0 : items.length - 1;
  } else {
    nextIndex = currentIndex + direction;
    // Clamp to list bounds (no wrap-around to avoid disorienting navigation).
    nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
  }

  items[nextIndex].focus();
}
