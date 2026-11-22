import { AnimatedCount } from "../../components/AnimatedCount";

export interface GaugeProps {
  /** Current count value (e.g. number of pending applications). */
  value: number;
  /** Maximum capacity (e.g. 15 for global cap, 4 for org cap). */
  max: number;
  /** Label describing what is being counted. */
  label: string;
  /**
   * Duration of the count animation in milliseconds.
   * @default 400
   */
  animationDuration?: number;
  /** Optional extra className on the root element. */
  className?: string;
}

function gaugeColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 10 / 15) return "var(--color-success-500, #22c55e)";
  if (ratio < 14 / 15) return "var(--color-warning-500, #f59e0b)";
  return "var(--color-error-500, #ef4444)";
}

/**
 * Circular/linear gauge that shows a workload count with an animated
 * transition whenever the value changes.
 *
 * The numeric display is handled by <AnimatedCount> which eases from the
 * previous value to the new one over `animationDuration` ms, respecting
 * `prefers-reduced-motion`.
 */
export function Gauge({
  value,
  max,
  label,
  animationDuration = 400,
  className,
}: GaugeProps) {
  const pct = Math.min((value / max) * 100, 100);
  const color = gaugeColor(value, max);
  const rootClass = ["gauge", className].filter(Boolean).join(" ");

  return (
    <div
      className={rootClass}
      aria-label={`${label}: ${value} of ${max}`}
    >
      <div className="gauge__label">{label}</div>

      {/* Numeric display with animated transition */}
      <div className="gauge__count" style={{ color }}>
        <AnimatedCount
          value={value}
          duration={animationDuration}
          aria-label={`${value} of ${max}`}
          className="gauge__animated-value"
        />
        <span className="gauge__separator" aria-hidden="true">/</span>
        <span className="gauge__max" aria-hidden="true">{max}</span>
      </div>

      {/* Progress bar */}
      <div
        className="gauge__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label}: ${value} of ${max}`}
      >
        <div
          className="gauge__fill"
          style={{
            width: `${pct}%`,
            background: color,
            transition: "width 400ms ease-out",
          }}
        />
      </div>
    </div>
  );
}
