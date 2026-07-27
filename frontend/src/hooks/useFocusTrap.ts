/**
 * useFocusTrap — closes #324
 *
 * Traps keyboard focus inside `containerRef` while `active` is true.
 * Also locks body scroll while active, and restores focus to the
 * previously-focused element when deactivated.
 */
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Stable ref for the keydown handler so we can remove it exactly
  const handlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      // Restore focus
      previousFocusRef.current?.focus();
      // Unlock scroll
      document.body.style.overflow = "";
      // Remove listener
      if (handlerRef.current) {
        document.removeEventListener("keydown", handlerRef.current);
        handlerRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Save current focus
    previousFocusRef.current = document.activeElement as HTMLElement;
    // Lock scroll
    document.body.style.overflow = "hidden";

    // Focus first focusable element after paint
    rafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
      focusable[0]?.focus();
    });

    // Tab-trap handler
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    handlerRef.current = onKeyDown;
    document.addEventListener("keydown", onKeyDown);

    return () => {
      // Cleanup on unmount or before re-run
      document.body.style.overflow = "";
      if (handlerRef.current) {
        document.removeEventListener("keydown", handlerRef.current);
        handlerRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, containerRef]);
}
