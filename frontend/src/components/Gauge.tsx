/**
 * Gauge — closes #274
 *
 * SVG arc gauge showing workload cap usage with:
 * - role="meter" ARIA attributes (aria-valuenow, aria-valuemin, aria-valuemax)
 * - Color thresholds: ≤50% green · 51-80% yellow · >80% red
 * - CSS transition animation on mount (strokeDashoffset)
 * - Responsive: scales from 200px to 400px container via size prop or CSS
 * - Two variants: global (0-15) and org (0-4)
 * - Optional tooltip on hover/focus
 */
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";
import "./Gauge.css";

export interface GaugeProps {
  /** Current used count */
  value: number;
  /** Maximum cap (15 for global, 4 for org) */
  max: number;
  /** Accessible label, e.g. "Global Applications" */
  label?: string;
  /**
   * Diameter in px. Default 120.
   * The component also accepts CSS `--gauge-size` custom property for
   * fully responsive scaling without re-rendering.
   */
  size?: number;
  /**
   * Variant hint — used for the data attribute only; styling is ratio-driven.
   * "global" = 0-15 cap, "org" = 0-4 cap.
   */
  variant?: "global" | "org";
  /** Optional tooltip text shown on hover / focus */
  tooltip?: string;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Convert degrees to radians */
const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Return an SVG arc path string.
 * Arc sweeps clockwise from startDeg to endDeg at radius r.
 */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Total arc circumference-like length for a given radius and sweep angle */
function arcLength(r: number, sweepDeg: number): number {
  return (sweepDeg / 360) * 2 * Math.PI * r;
}

// ---------------------------------------------------------------------------
// Color threshold (per acceptance criteria)
// ≤50% green · 51-80% yellow · >80% red
// ---------------------------------------------------------------------------
export function gaugeColor(ratio: number): string {
  if (ratio <= 0.5) return "var(--color-success-500)";
  if (ratio <= 0.8) return "var(--color-warning-500)";
  return "var(--color-error-500)";
}

/** Return the BEM modifier that matches the current ratio */
export function gaugeColorClass(ratio: number): string {
  if (ratio <= 0.5) return "gauge--green";
  if (ratio <= 0.8) return "gauge--yellow";
  return "gauge--red";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const START_DEG = 135;   // bottom-left
const TOTAL_ARC = 270;   // sweep angle

export function Gauge({
  value,
  max,
  label,
  size = 120,
  variant,
  tooltip,
}: GaugeProps) {
  const ratio    = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const cx       = size / 2;
  const cy       = size / 2;
  const r        = size * 0.38;
  const sw       = size * 0.1;   // stroke width
  const endDeg   = START_DEG + TOTAL_ARC * ratio;

  const trackColor = "var(--color-border)";
  const fillColor  = gaugeColor(ratio);
  const colorClass = gaugeColorClass(ratio);
  const pct        = Math.round(ratio * 100);

  // ── Animation on mount ───────────────────────────────────────
  // We animate strokeDashoffset from fullLength → 0 via a CSS transition.
  // The CSS class .gauge__fill--animated drives the transition; we add it
  // one frame after mount so the browser registers the initial dashoffset.
  const fillRef         = useRef<SVGPathElement>(null);
  const [animated, setAnimated] = useState(false);

  // Full arc length = the track's arc length
  const fullLen = arcLength(r, TOTAL_ARC);
  // Fill arc length proportional to ratio
  const fillLen = fullLen * ratio;

  useEffect(() => {
    // Trigger the CSS transition one RAF after the element paints
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // ── Re-animate whenever value changes ────────────────────────
  useEffect(() => {
    setAnimated(false);
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [value, max]);

  // ── Build the figure element ─────────────────────────────────
  const figure = (
    <figure
      className={`gauge ${colorClass}`}
      data-variant={variant}
      style={{ "--gauge-size": `${size}px` } as React.CSSProperties}
      // role="meter" + ARIA meter attributes on the figure wrapper
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ? `${label}: ${value} of ${max}` : `${value} of ${max}`}
      tabIndex={tooltip ? 0 : undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        focusable="false"
        className="gauge__svg"
      >
        {/* Track arc (background) */}
        <path
          d={arcPath(cx, cy, r, START_DEG, START_DEG + TOTAL_ARC)}
          fill="none"
          stroke={trackColor}
          strokeWidth={sw}
          strokeLinecap="round"
          className="gauge__track"
        />

        {/* Fill arc — animated via strokeDasharray / strokeDashoffset */}
        {ratio > 0 && (
          <path
            ref={fillRef}
            d={arcPath(cx, cy, r, START_DEG, START_DEG + TOTAL_ARC)}
            fill="none"
            stroke={fillColor}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${fullLen} ${fullLen}`}
            strokeDashoffset={animated ? fullLen - fillLen : fullLen}
            className={`gauge__fill${animated ? " gauge__fill--animated" : ""}`}
          />
        )}

        {/* Centre text: percentage */}
        <text
          x={cx}
          y={cy - size * 0.04}
          textAnchor="middle"
          dominantBaseline="middle"
          className="gauge__pct"
          fill="var(--color-text)"
        >
          {pct}%
        </text>

        {/* Centre text: value/max */}
        <text
          x={cx}
          y={cy + size * 0.14}
          textAnchor="middle"
          dominantBaseline="middle"
          className="gauge__value"
          fill="var(--color-muted)"
        >
          {value}/{max}
        </text>
      </svg>

      {label && (
        <figcaption className="gauge__label">{label}</figcaption>
      )}
    </figure>
  );

  if (!tooltip) return figure;

  return (
    <Tooltip content={tooltip} position="top">
      {figure}
    </Tooltip>
  );
}
