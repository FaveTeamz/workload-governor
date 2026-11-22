const GLOBAL_CAP = 15;
const ORG_CAP    = 4;

function barColor(value: number, cap: number): string {
  const ratio = value / cap;
  if (ratio < 10 / 15) return "var(--color-success-500)";
  if (ratio < 14 / 15) return "var(--color-warning-500)";
  return "var(--color-error-500)";
}

interface BarProps {
  value: number;
  cap: number;
  label: string;
  tooltip: string;
}

function CapacityBar({ value, cap, label, tooltip }: BarProps) {
  const pct = Math.min((value / cap) * 100, 100);
  const color = barColor(value, cap);

  return (
    <div className="cap-bar" title={tooltip}>
      <div className="cap-bar__header">
        <span className="cap-bar__label">{label}</span>
        <span className="cap-bar__count" style={{ color }} aria-label={`${value} of ${cap}`}>
          {value}/{cap}
        </span>
      </div>
      <div
        className="cap-bar__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-label={`${label}: ${value} of ${cap}`}
      >
        <div
          className="cap-bar__fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export interface OrgCount {
  org: string;
  assignments: number;
}

interface CapacityBarsProps {
  globalApplications: number;
  orgCounts: OrgCount[];
}

export function CapacityBars({ globalApplications, orgCounts }: CapacityBarsProps) {
  return (
    <section className="capacity-bars" aria-label="Capacity overview">
      <CapacityBar
        value={globalApplications}
        cap={GLOBAL_CAP}
        label="Global applications"
        tooltip={`You may have at most ${GLOBAL_CAP} pending applications across all organisations.`}
      />
      {orgCounts.map(({ org, assignments }) => (
        <CapacityBar
          key={org}
          value={assignments}
          cap={ORG_CAP}
          label={org}
          tooltip={`At most ${ORG_CAP} active assignments per organisation.`}
        />
      ))}
    </section>
  );
}
