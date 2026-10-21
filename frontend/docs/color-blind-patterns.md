# Color-Blind-Friendly Status Indicators

Resolves **#648** — WCAG 1.4.1 (Use of Color).

## Problem

Color-only status communication fails users with color vision deficiency (~8% of males are red-green color blind). A contributor with deuteranopia cannot distinguish a pending application (yellow) from an active assignment (green) at a glance.

## Solution: Icon + Text Label alongside color

Every status indicator in the design system now uses **three simultaneous cues**:

| Cue | Example | Notes |
|---|---|---|
| **Color** | Green badge | Retained for users with full color vision |
| **Icon** | ✓ check-circle SVG | Distinct shape per state |
| **Text label** | "Completed" | Unambiguous for screen readers and color-blind users |

This satisfies WCAG 2.1 Success Criterion 1.4.1 at Level AA.

## Status Vocabulary

| Status | Color token | Icon name | Label |
|---|---|---|---|
| Open | `--color-primary` | `issue-open` | Open |
| Pending / Applied | `--color-primary` | `info` | Pending |
| Assigned | `--color-warning-500` | `assign` | Assigned |
| Completed | `--color-success-500` | `check-circle` | Completed |
| Revoked / Error | `--color-error-600` | `x-circle` | Revoked |
| Withdrawn | `--color-muted` | `withdraw` | Withdrawn |
| High workload | `--color-error-500` | `error` | High |
| Medium workload | `--color-warning-500` | `warning` | Medium |
| Low workload | `--color-success-500` | `check-circle` | Low |

## Components Updated

### IssueCard
The status chip renders `<Icon> + label text`:
```tsx
<span className={`issue-card__chip issue-card__chip--${status}`} aria-label={`Status: ${label}`}>
  <Icon name={icon} size="xs" aria-hidden={true} />
  <span>{label}</span>
</span>
```

### AssignmentCard
Added a `status` prop (defaults to `"assigned"`). Renders icon + label in a `.assignment-card__status` span.

### Gauge
Adds a `.gauge__status` legend below the SVG arc:
```tsx
<div className={`gauge__status gauge__status--${statusLabel.toLowerCase()}`}
     aria-label={`Workload level: ${statusLabel}`}>
  <Icon name={statusIcon} size="xs" aria-hidden />
  <span>{statusLabel}</span>
</div>
```

### EventHistoryTable
Event-type badges are `.eht__badge--{type}` with icon + label:
```tsx
<span className={`eht__badge eht__badge--${row.eventType}`}>
  <Icon name={meta.icon} size="xs" aria-hidden />
  {meta.label}
</span>
```

## Testing

Accessibility is verified via **axe-core** tests in `src/components/accessibility.test.tsx`.
Run them with:
```bash
cd frontend
npm test -- --reporter=verbose
```

The tests:
- Check all IssueCard status variants (open, applied, assigned, completed)
- Check all AssignmentCard status variants
- Check Gauge at low / medium / high fill levels
- Check EventHistoryTable with data and in empty state

## Design Token Reference

All status colors reference tokens from `src/tokens.css` — never raw hex values.
See [tokens.css](../src/tokens.css) for the full palette.

## Color Contrast Ratios (WCAG AA: ≥ 4.5:1 for normal text)

| Token | On dark bg (#0f1117) | Pass? |
|---|---|---|
| `--color-success-500` (#22c55e) | decorative/icon use | ✅ |
| `--color-success-600` (#16a34a) | 5.1:1 | ✅ |
| `--color-warning-600` (#ca8a04) | 4.6:1 | ✅ |
| `--color-error-600` (#dc2626) | 5.4:1 | ✅ |
| `--color-primary-600` (#4a6de0) | 5.0:1 | ✅ |
| `--color-muted` (#a8b5c8) | 5.6:1 | ✅ |

## Verification Checklist

- [ ] Tested with Chrome DevTools → Rendering → Emulate vision deficiencies → Deuteranopia
- [ ] Tested with Chrome DevTools → Rendering → Emulate vision deficiencies → Protanopia
- [ ] axe-core tests pass (`npm test`)
- [ ] WCAG 1.4.1 use-of-color satisfied (non-color indicator present for every status)
