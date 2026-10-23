import { useState, useEffect, useRef } from "react";

export interface AnimatedCountProps {
  /** The target value to animate towards. */
  value: number;
  /**
   * Duration of the animation in milliseconds.
   * @default 400
   */
  duration?: number;
  /** Optional className applied to the wrapping span. */
  className?: string;
  /** aria-label for the span (e.g. "3 of 15"). */
  "aria-label"?: string;
}

/**
 * Animates a numeric count from its previous value to a new one using an
 * ease-out lerp. Respects the user's `prefers-reduced-motion` setting — when
 * reduced motion is requested the number jumps to the target immediately.
 */
export function AnimatedCount({
  value,
  duration = 400,
  className,
  "aria-label": ariaLabel,
}: AnimatedCountProps) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) return;

    // Honour prefers-reduced-motion
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || duration <= 0) {
      setDisplayed(to);
      return;
    }

    const start = performance.now();
    const delta = to - from;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(from + delta * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration]);

  return (
    <span
      className={["animated-count", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      aria-live="polite"
      aria-atomic="true"
    >
      {displayed}
    </span>
  );
}
