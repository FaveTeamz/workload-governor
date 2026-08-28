export interface GaugeProps {
  /** Current value (0 – max) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Label shown below the gauge */
  label?: string;
  /** Diameter of the SVG in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Optional aria description for screen readers */
  "aria-label"?: string;
}

/**
 * Design-system Gauge.
 * Circular progress indicator that changes colour as the value approaches max.
 * Green ≤ 50 %, amber ≤ 80 %, red > 80 %.
 */
export function Gauge({
  value,
  max = 100,
  label,
  size = 80,
  strokeWidth = 8,
  "aria-label": ariaLabel,
}: GaugeProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const pct = clamped / max;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const cx = size / 2;
  const cy = size / 2;

  const colour =
    pct > 0.8 ? "var(--gauge-danger, #ef4444)"
    : pct > 0.5 ? "var(--gauge-warn, #f59e0b)"
    : "var(--gauge-ok, #22c55e)";

  const labelText = ariaLabel ?? `${label ?? "Progress"}: ${clamped} of ${max}`;

  return (
    <div className="gauge" aria-label={labelText}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--gauge-track, #2e3347)"
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
        />
        {/* Centre text */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-text, #e2e8f0)"
          fontSize={size * 0.22}
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          {clamped}/{max}
        </text>
      </svg>
      {label && (
        <p className="gauge-label" aria-hidden="true">
          {label}
        </p>
      )}
    </div>
  );
}
