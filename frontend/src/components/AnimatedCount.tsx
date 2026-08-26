/**
 * AnimatedCount
 *
 * Smoothly animates a numeric value using requestAnimationFrame.
 * - Respects prefers-reduced-motion: skips animation, renders final value immediately
 * - aria-live="polite" announces the new value to screen readers
 * - Supports custom formatters (e.g. percentages, locale strings)
 * - Works for both increment and decrement transitions
 */

import { useEffect, useRef, useState } from "react";

// ── Easing ───────────────────────────────────────────────────────────────────

/** Ease-out cubic — fast start, smooth landing */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

function useAnimatedValue(
  target: number,
  duration: number
): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    const diff = target - from;

    // Nothing to animate
    if (diff === 0) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setDisplay(Math.round(from + diff * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Guarantee exact final value
        setDisplay(target);
        fromRef.current = target;
        rafRef.current = null;
      }
    }

    // Cancel any in-flight animation before starting a new one
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, duration]);

  return display;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface AnimatedCountProps {
  /** Target numeric value to animate to */
  value: number;
  /** Animation duration in milliseconds. Default: 500 */
  duration?: number;
  /** Optional formatter. Default: String(n) */
  formatter?: (n: number) => string;
  /** Additional className for the wrapper span */
  className?: string;
  /** aria-label for the containing element */
  "aria-label"?: string;
}

export function AnimatedCount({
  value,
  duration = 500,
  formatter,
  className,
  "aria-label": ariaLabel,
}: AnimatedCountProps) {
  const display = useAnimatedValue(value, duration);
  const formatted = formatter ? formatter(display) : String(display);

  return (
    <span
      className={className}
      aria-live="polite"
      aria-atomic="true"
      aria-label={ariaLabel}
    >
      {formatted}
    </span>
  );
}

// Default export for backward-compat with any existing import of the default
export default AnimatedCount;
