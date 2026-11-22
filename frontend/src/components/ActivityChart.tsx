import type { MonthlyActivity } from '../hooks/useActivityStats';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAR_COLORS = {
  applied:   'var(--color-primary, #6c8eff)',
  assigned:  '#a855f7',
  completed: 'var(--color-complete, #22c55e)',
} as const;

const SVG_HEIGHT = 180;
const AXIS_HEIGHT = 24;   // bottom axis label area
const AXIS_LEFT  = 30;    // left axis (Y-labels)
const BAR_GAP    = 3;     // px gap between bar groups
const Y_TICKS    = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Short month label e.g. "Jan", "Feb" */
function shortMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'short' });
}

/** Y axis tick values: 0, ceil/4, ceil/2, 3*ceil/4, ceil */
function yTicks(maxVal: number): number[] {
  if (maxVal === 0) return [0, 1, 2, 3, 4];
  const top = Math.ceil(maxVal / Y_TICKS) * Y_TICKS;
  return Array.from({ length: Y_TICKS + 1 }, (_, i) => (top / Y_TICKS) * i);
}

// ---------------------------------------------------------------------------
// ActivityChart
// ---------------------------------------------------------------------------

export interface ActivityChartProps {
  activity: MonthlyActivity[];
}

/**
 * SVG bar chart showing monthly applied / assigned / completed counts
 * for the last 12 months.
 *
 * Accessibility:
 *  - A visually-hidden `<table>` provides the same data to screen readers.
 *  - The SVG is `aria-hidden` so assistive technologies skip it.
 *  - The outer section has a descriptive `aria-label`.
 *
 * Responsive: the SVG uses `viewBox` + `width="100%"` so it scales to
 * its container width automatically. No JS resize observer required.
 */
export function ActivityChart({ activity }: ActivityChartProps) {
  if (activity.length === 0) {
    return (
      <section className="activity-chart" aria-label="Monthly activity chart">
        <p className="activity-chart__empty">No activity data yet.</p>
      </section>
    );
  }

  const maxVal = Math.max(
    1, // avoid division by zero when all values are 0
    ...activity.flatMap((m) => [m.applied, m.assigned, m.completed]),
  );
  const ticks = yTicks(maxVal);
  const topTick = ticks[ticks.length - 1];

  const svgWidth   = 600; // viewBox units — scales freely
  const chartWidth = svgWidth - AXIS_LEFT;
  const chartHeight = SVG_HEIGHT - AXIS_HEIGHT;
  const groupWidth = chartWidth / activity.length;
  const barWidth   = Math.max(2, (groupWidth - BAR_GAP * 4) / 3);

  /** Map a value to a Y coordinate (0 = top of chart area) */
  function barY(val: number) {
    return chartHeight - (val / topTick) * chartHeight;
  }
  function barH(val: number) {
    return (val / topTick) * chartHeight;
  }

  return (
    <section className="activity-chart" aria-label="Monthly activity bar chart">
      {/* Visible SVG chart */}
      <svg
        viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
        width="100%"
        aria-hidden="true"
        focusable="false"
        className="activity-chart__svg"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Y-axis gridlines and labels */}
        {ticks.map((tick) => {
          const y = barY(tick);
          return (
            <g key={tick}>
              <line
                x1={AXIS_LEFT}
                y1={y}
                x2={svgWidth}
                y2={y}
                stroke="var(--color-border, #2e3347)"
                strokeWidth={tick === 0 ? 1.5 : 0.5}
                strokeDasharray={tick === 0 ? undefined : '3 3'}
              />
              <text
                x={AXIS_LEFT - 4}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-muted, #94a3b8)"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Bar groups */}
        {activity.map((month, idx) => {
          const groupX = AXIS_LEFT + idx * groupWidth + BAR_GAP;
          const series: Array<{ key: keyof typeof BAR_COLORS; val: number }> = [
            { key: 'applied',   val: month.applied   },
            { key: 'assigned',  val: month.assigned  },
            { key: 'completed', val: month.completed },
          ];

          return (
            <g key={month.month}>
              {series.map(({ key, val }, si) => {
                const x = groupX + si * (barWidth + BAR_GAP);
                const h = barH(val);
                const y = barY(val);
                if (val === 0) return null;
                return (
                  <rect
                    key={key}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={BAR_COLORS[key]}
                    rx={2}
                  />
                );
              })}

              {/* X-axis label */}
              <text
                x={groupX + groupWidth / 2 - BAR_GAP}
                y={SVG_HEIGHT - 6}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-muted, #94a3b8)"
              >
                {shortMonth(month.month)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="activity-chart__legend" aria-hidden="true">
        {(Object.entries(BAR_COLORS) as Array<[keyof typeof BAR_COLORS, string]>).map(([key, color]) => (
          <span key={key} className="activity-chart__legend-item">
            <span
              className="activity-chart__legend-dot"
              style={{ background: color }}
            />
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </span>
        ))}
      </div>

      {/* Screen-reader accessible data table (visually hidden) */}
      <table className="sr-only" aria-label="Monthly activity data">
        <caption>Activity counts by month for the last 12 months</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Applied</th>
            <th scope="col">Assigned</th>
            <th scope="col">Completed</th>
          </tr>
        </thead>
        <tbody>
          {activity.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.month}</th>
              <td>{m.applied}</td>
              <td>{m.assigned}</td>
              <td>{m.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
