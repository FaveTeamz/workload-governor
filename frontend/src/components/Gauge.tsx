/**
 * Gauge — closes #323 (tooltip integration), #648 (color-blind status legend)
 *
 * Added a status legend below the arc: icon + text label so color is never
 * the sole indicator of workload level.
 */
import { Tooltip } from "./Tooltip";
import { Icon } from "./Icon";

export interface GaugeProps {
  value:    number;  // current value
  max:      number;  // maximum value
  label?:   string;
  size?:    number;  // diameter in px, default 120
  tooltip?: string;  // plain-language explanation shown on hover/focus
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

// ─── Status bands ────────────────────────────────────────────────────────────
// Communicated by color AND icon+label for color-blind users (#648)

interface StatusBand {
  label: "Low" | "Medium" | "High";
  icon: "check-circle" | "warning" | "error";
  fillColor: string;
}

function resolveStatus(ratio: number): StatusBand {
  if (ratio < 0.67) return { label: "Low",    icon: "check-circle", fillColor: "var(--color-success-500)" };
  if (ratio < 0.93) return { label: "Medium", icon: "warning",      fillColor: "var(--color-warning-500)" };
  return               { label: "High",   icon: "error",        fillColor: "var(--color-error-500)"   };
}

export function Gauge({ value, max, label, size = 120, tooltip }: GaugeProps) {
  const ratio    = Math.min(Math.max(value / max, 0), 1);
  const cx       = size / 2;
  const cy       = size / 2;
  const r        = size * 0.38;
  const startDeg = 135;
  const totalArc = 270;
  const endDeg   = startDeg + totalArc * ratio;

  const trackColor = "var(--color-border)";
  const { label: statusLabel, icon: statusIcon, fillColor } = resolveStatus(ratio);
  const pct = Math.round(ratio * 100);

  const figure = (
    <figure
      className="gauge"
      aria-label={label}
      tabIndex={tooltip ? 0 : undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? "Gauge"}: ${value} of ${max} (${statusLabel})`}
      >
        {/* track */}
        <path
          d={arcPath(cx, cy, r, startDeg, startDeg + totalArc)}
          fill="none"
          stroke={trackColor}
          strokeWidth={size * 0.1}
          strokeLinecap="round"
        />
        {/* fill */}
        {ratio > 0 && (
          <path
            d={arcPath(cx, cy, r, startDeg, endDeg)}
            fill="none"
            stroke={fillColor}
            strokeWidth={size * 0.1}
            strokeLinecap="round"
          />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" className="gauge__pct" fill="var(--color-text)">
          {pct}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="gauge__value" fill="var(--color-muted)">
          {value}/{max}
        </text>
      </svg>

      {label && <figcaption className="gauge__label">{label}</figcaption>}

      {/* Color-blind-friendly status legend: icon + text (#648) */}
      <div
        className={`gauge__status gauge__status--${statusLabel.toLowerCase()}`}
        aria-label={`Workload level: ${statusLabel}`}
      >
        <Icon name={statusIcon} size="xs" aria-hidden={true} />
        <span>{statusLabel}</span>
      </div>
    </figure>
  );

  if (!tooltip) return figure;

  return (
    <Tooltip content={tooltip} position="top">
      {figure}
    </Tooltip>
  );
}
