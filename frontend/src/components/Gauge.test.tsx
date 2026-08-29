/**
 * Gauge.test.tsx — issue #274
 *
 * Unit tests for:
 *  - Correct fill percentage calculation
 *  - Color class thresholds (≤50% green · 51-80% yellow · >80% red)
 *  - ARIA meter attributes
 *  - Animation class applied after mount
 *  - Snapshot
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Gauge, gaugeColor, gaugeColorClass } from './Gauge'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render a gauge and return the role=meter element. */
function renderGauge(value: number, max: number, extra = {}) {
  const { container } = render(
    <Gauge value={value} max={max} label="Test Gauge" size={120} {...extra} />
  )
  const meter = screen.getByRole('meter')
  return { container, meter }
}

// ---------------------------------------------------------------------------
// gaugeColor helper
// ---------------------------------------------------------------------------

describe('gaugeColor()', () => {
  it('returns success color at exactly 0%', () => {
    expect(gaugeColor(0)).toBe('var(--color-success-500)')
  })

  it('returns success color at exactly 50%', () => {
    expect(gaugeColor(0.5)).toBe('var(--color-success-500)')
  })

  it('returns warning color at 51%', () => {
    expect(gaugeColor(0.51)).toBe('var(--color-warning-500)')
  })

  it('returns warning color at exactly 80%', () => {
    expect(gaugeColor(0.8)).toBe('var(--color-warning-500)')
  })

  it('returns error color at 81%', () => {
    expect(gaugeColor(0.81)).toBe('var(--color-error-500)')
  })

  it('returns error color at 100%', () => {
    expect(gaugeColor(1)).toBe('var(--color-error-500)')
  })
})

// ---------------------------------------------------------------------------
// gaugeColorClass helper
// ---------------------------------------------------------------------------

describe('gaugeColorClass()', () => {
  it('returns gauge--green at 0%',   () => expect(gaugeColorClass(0)).toBe('gauge--green'))
  it('returns gauge--green at 50%',  () => expect(gaugeColorClass(0.5)).toBe('gauge--green'))
  it('returns gauge--yellow at 51%', () => expect(gaugeColorClass(0.51)).toBe('gauge--yellow'))
  it('returns gauge--yellow at 80%', () => expect(gaugeColorClass(0.8)).toBe('gauge--yellow'))
  it('returns gauge--red at 81%',    () => expect(gaugeColorClass(0.81)).toBe('gauge--red'))
  it('returns gauge--red at 100%',   () => expect(gaugeColorClass(1)).toBe('gauge--red'))
})

// ---------------------------------------------------------------------------
// ARIA meter attributes
// ---------------------------------------------------------------------------

describe('ARIA meter attributes', () => {
  it('sets role="meter"', () => {
    renderGauge(7, 15)
    expect(screen.getByRole('meter')).toBeInTheDocument()
  })

  it('sets aria-valuenow to value', () => {
    const { meter } = renderGauge(7, 15)
    expect(meter).toHaveAttribute('aria-valuenow', '7')
  })

  it('sets aria-valuemin to 0', () => {
    const { meter } = renderGauge(7, 15)
    expect(meter).toHaveAttribute('aria-valuemin', '0')
  })

  it('sets aria-valuemax to max', () => {
    const { meter } = renderGauge(7, 15)
    expect(meter).toHaveAttribute('aria-valuemax', '15')
  })

  it('sets aria-label including value and max', () => {
    const { meter } = renderGauge(7, 15)
    expect(meter.getAttribute('aria-label')).toMatch(/7/)
    expect(meter.getAttribute('aria-label')).toMatch(/15/)
  })

  it('includes label text in aria-label when label prop is set', () => {
    render(<Gauge value={3} max={4} label="Org Assignments" />)
    const meter = screen.getByRole('meter')
    expect(meter.getAttribute('aria-label')).toContain('Org Assignments')
  })

  it('works with org cap (max=4)', () => {
    const { meter } = renderGauge(2, 4)
    expect(meter).toHaveAttribute('aria-valuenow', '2')
    expect(meter).toHaveAttribute('aria-valuemax', '4')
  })
})

// ---------------------------------------------------------------------------
// Fill percentage display
// ---------------------------------------------------------------------------

describe('fill percentage display', () => {
  it('shows 0% when value=0', () => {
    renderGauge(0, 15)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows correct percentage for value=7, max=15 (47%)', () => {
    renderGauge(7, 15)
    expect(screen.getByText('47%')).toBeInTheDocument()
  })

  it('shows 50% for value=1, max=2', () => {
    renderGauge(1, 2)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows 100% when value=max', () => {
    renderGauge(15, 15)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('shows value/max text', () => {
    renderGauge(7, 15)
    expect(screen.getByText('7/15')).toBeInTheDocument()
  })

  it('clamps ratio to 1 when value exceeds max', () => {
    renderGauge(20, 15)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('clamps ratio to 0 when value is negative', () => {
    renderGauge(-1, 15)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Color threshold classes on the figure element
// ---------------------------------------------------------------------------

describe('color threshold classes', () => {
  it('applies gauge--green at ≤50%', () => {
    const { meter } = renderGauge(7, 15) // 47%
    expect(meter.className).toContain('gauge--green')
  })

  it('applies gauge--green at exactly 50%', () => {
    const { meter } = renderGauge(1, 2) // 50%
    expect(meter.className).toContain('gauge--green')
  })

  it('applies gauge--yellow at 51%', () => {
    const { meter } = renderGauge(9, 15) // 60%
    expect(meter.className).toContain('gauge--yellow')
  })

  it('applies gauge--yellow at 80%', () => {
    const { meter } = renderGauge(12, 15) // 80%
    expect(meter.className).toContain('gauge--yellow')
  })

  it('applies gauge--red above 80%', () => {
    const { meter } = renderGauge(13, 15) // 87%
    expect(meter.className).toContain('gauge--red')
  })

  it('applies gauge--red at 100%', () => {
    const { meter } = renderGauge(15, 15) // 100%
    expect(meter.className).toContain('gauge--red')
  })

  it('applies gauge--red for full org cap (4/4)', () => {
    const { meter } = renderGauge(4, 4) // 100%
    expect(meter.className).toContain('gauge--red')
  })
})

// ---------------------------------------------------------------------------
// Animation class
// ---------------------------------------------------------------------------

describe('animation class on mount', () => {
  beforeEach(() => {
    // Fake requestAnimationFrame to fire synchronously in tests
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds gauge__fill--animated class to fill path after mount', async () => {
    const { container } = render(<Gauge value={8} max={15} label="Test" />)
    // After rAF fires synchronously, the animated class should be present
    await act(async () => {})
    const fill = container.querySelector('.gauge__fill--animated')
    expect(fill).not.toBeNull()
  })

  it('fill path is absent when value is 0 (nothing to animate)', () => {
    const { container } = render(<Gauge value={0} max={15} label="Test" />)
    // No fill path rendered when ratio=0
    expect(container.querySelector('.gauge__fill')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Variant prop
// ---------------------------------------------------------------------------

describe('variant prop', () => {
  it('sets data-variant="global"', () => {
    const { meter } = renderGauge(7, 15, { variant: 'global' })
    expect(meter).toHaveAttribute('data-variant', 'global')
  })

  it('sets data-variant="org"', () => {
    const { meter } = renderGauge(2, 4, { variant: 'org' })
    expect(meter).toHaveAttribute('data-variant', 'org')
  })
})

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

describe('label prop', () => {
  it('renders figcaption when label is provided', () => {
    render(<Gauge value={5} max={15} label="Global Applications" />)
    expect(screen.getByText('Global Applications')).toBeInTheDocument()
  })

  it('renders no figcaption when label is omitted', () => {
    const { container } = render(<Gauge value={5} max={15} />)
    expect(container.querySelector('figcaption')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

describe('Gauge snapshot', () => {
  it('matches snapshot at 0% (value=0, max=15)', () => {
    const { container } = render(<Gauge value={0} max={15} label="Global Applications" size={120} />)
    expect(container).toMatchSnapshot()
  })

  it('matches snapshot at ~47% (value=7, max=15)', () => {
    const { container } = render(<Gauge value={7} max={15} label="Global Applications" size={120} />)
    expect(container).toMatchSnapshot()
  })

  it('matches snapshot at 100% (value=15, max=15)', () => {
    const { container } = render(<Gauge value={15} max={15} label="Global Applications" size={120} />)
    expect(container).toMatchSnapshot()
  })

  it('matches snapshot for org variant (value=2, max=4)', () => {
    const { container } = render(<Gauge value={2} max={4} label="Org: stellar-org" size={120} variant="org" />)
    expect(container).toMatchSnapshot()
  })
})
