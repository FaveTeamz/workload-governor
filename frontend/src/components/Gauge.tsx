export interface GaugeProps {
  value:   number   // current value
  max:     number   // maximum value
  label?:  string
  size?:   number   // diameter in px, default 120
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(startDeg))
  const y1 = cy + r * Math.sin(toRad(startDeg))
  const x2 = cx + r * Math.cos(toRad(endDeg))
  const y2 = cy + r * Math.sin(toRad(endDeg))
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

export function Gauge({ value, max, label, size = 120 }: GaugeProps) {
  const ratio    = Math.min(Math.max(value / max, 0), 1)
  const cx       = size / 2
  const cy       = size / 2
  const r        = size * 0.38
  const startDeg = 135
  const totalArc = 270
  const endDeg   = startDeg + totalArc * ratio

  const trackColor = 'var(--color-border)'
  const fillColor  = ratio < 0.67 ? 'var(--color-success-500)'
                   : ratio < 0.93 ? 'var(--color-warning-500)'
                   :                'var(--color-error-500)'

  const pct = Math.round(ratio * 100)

  return (
    <figure className="gauge" aria-label={label}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? 'Gauge'}: ${value} of ${max}`}
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
    </figure>
  )
}
