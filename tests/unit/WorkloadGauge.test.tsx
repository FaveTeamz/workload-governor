import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WorkloadGauge, normaliseCount } from '../../frontend/src/components/WorkloadGauge';

// ── normaliseCount (pure helper) ─────────────────────────────────────────────

describe('normaliseCount', () => {
  it('returns 0 for undefined', () => {
    expect(normaliseCount(undefined)).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(normaliseCount(null)).toBe(0);
  });

  it('returns 0 for a negative number', () => {
    expect(normaliseCount(-3)).toBe(0);
  });

  it('floors a positive float', () => {
    expect(normaliseCount(3.9)).toBe(3);
    expect(normaliseCount(0.1)).toBe(0);
  });

  it('passes through a positive integer unchanged', () => {
    expect(normaliseCount(7)).toBe(7);
    expect(normaliseCount(0)).toBe(0);
  });
});

// ── WorkloadGauge – rendering ─────────────────────────────────────────────────

describe('WorkloadGauge', () => {
  // ── empty state: current = 0, max = 15 ────────────────────────────────────

  describe('empty state (current = 0, max = 15)', () => {
    it('renders with data-state="empty"', () => {
      const { getByTestId } = render(<WorkloadGauge current={0} max={15} />);
      expect(getByTestId('workload-gauge').dataset.state).toBe('empty');
    });

    it('displays "0/15" count', () => {
      const { getByTestId } = render(<WorkloadGauge current={0} max={15} />);
      expect(getByTestId('workload-gauge-count').textContent).toBe('0/15');
    });

    it('fill bar has 0% width', () => {
      const { getByTestId } = render(<WorkloadGauge current={0} max={15} />);
      expect(getByTestId('workload-gauge-fill').style.width).toBe('0%');
    });

    it('progressbar aria attributes are correct', () => {
      const { getByRole } = render(<WorkloadGauge current={0} max={15} label="global applications" />);
      const bar = getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('0');
      expect(bar.getAttribute('aria-valuemin')).toBe('0');
      expect(bar.getAttribute('aria-valuemax')).toBe('15');
    });

    it('matches snapshot', () => {
      const { container } = render(<WorkloadGauge current={0} max={15} label="global applications" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── full state: current = max ──────────────────────────────────────────────

  describe('full state (current = max)', () => {
    it('renders with data-state="full"', () => {
      const { getByTestId } = render(<WorkloadGauge current={4} max={4} />);
      expect(getByTestId('workload-gauge').dataset.state).toBe('full');
    });

    it('displays "4/4" count', () => {
      const { getByTestId } = render(<WorkloadGauge current={4} max={4} />);
      expect(getByTestId('workload-gauge-count').textContent).toBe('4/4');
    });

    it('fill bar has 100% width', () => {
      const { getByTestId } = render(<WorkloadGauge current={4} max={4} />);
      expect(getByTestId('workload-gauge-fill').style.width).toBe('100%');
    });

    it('has --full class suffix', () => {
      const { getByTestId } = render(<WorkloadGauge current={15} max={15} />);
      expect(getByTestId('workload-gauge').className).toContain('workload-gauge--full');
    });

    it('matches snapshot', () => {
      const { container } = render(<WorkloadGauge current={4} max={4} label="org assignments" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── overflow: current > max ────────────────────────────────────────────────

  describe('overflow state (current > max)', () => {
    it('renders with data-state="full" when current exceeds max', () => {
      const { getByTestId } = render(<WorkloadGauge current={20} max={15} />);
      expect(getByTestId('workload-gauge').dataset.state).toBe('full');
    });

    it('caps fill bar at 100%', () => {
      const { getByTestId } = render(<WorkloadGauge current={20} max={15} />);
      expect(getByTestId('workload-gauge-fill').style.width).toBe('100%');
    });

    it('displays count capped at max/max instead of raw overflow', () => {
      // Defensive: we do not show "20/15" to avoid user confusion.
      const { getByTestId } = render(<WorkloadGauge current={20} max={15} />);
      expect(getByTestId('workload-gauge-count').textContent).toBe('15/15');
    });

    it('matches snapshot', () => {
      const { container } = render(<WorkloadGauge current={20} max={15} label="global applications" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── undefined / null props ─────────────────────────────────────────────────

  describe('undefined / null props (should not crash)', () => {
    it('renders without error when both props are undefined', () => {
      expect(() => render(<WorkloadGauge />)).not.toThrow();
    });

    it('renders without error when current is null', () => {
      expect(() => render(<WorkloadGauge current={null} max={15} />)).not.toThrow();
    });

    it('renders without error when max is null', () => {
      expect(() => render(<WorkloadGauge current={3} max={null} />)).not.toThrow();
    });

    it('renders without error when both are null', () => {
      expect(() => render(<WorkloadGauge current={null} max={null} />)).not.toThrow();
    });

    it('treats undefined current as 0', () => {
      const { getByTestId } = render(<WorkloadGauge max={15} />);
      expect(getByTestId('workload-gauge-count').textContent).toMatch(/^0\//);
    });

    it('treats null current as 0', () => {
      const { getByTestId } = render(<WorkloadGauge current={null} max={15} />);
      expect(getByTestId('workload-gauge-count').textContent).toMatch(/^0\//);
    });

    it('treats null max as 1 (avoids division-by-zero) and shows empty state', () => {
      const { getByTestId } = render(<WorkloadGauge current={0} max={null} />);
      expect(getByTestId('workload-gauge').dataset.state).toBe('empty');
    });

    it('matches snapshot for all-undefined props', () => {
      const { container } = render(<WorkloadGauge />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── non-integer values ─────────────────────────────────────────────────────

  describe('non-integer values (should floor gracefully)', () => {
    it('floors a float current value', () => {
      const { getByTestId } = render(<WorkloadGauge current={2.9} max={4} />);
      expect(getByTestId('workload-gauge-count').textContent).toBe('2/4');
    });

    it('floors a float max value', () => {
      const { getByTestId } = render(<WorkloadGauge current={2} max={4.7} />);
      expect(getByTestId('workload-gauge-count').textContent).toBe('2/4');
    });

    it('floors both float current and max', () => {
      const { getByTestId } = render(<WorkloadGauge current={1.5} max={3.9} />);
      expect(getByTestId('workload-gauge-count').textContent).toBe('1/3');
    });

    it('treats negative current as 0 and shows empty state', () => {
      const { getByTestId } = render(<WorkloadGauge current={-5} max={10} />);
      expect(getByTestId('workload-gauge').dataset.state).toBe('empty');
      expect(getByTestId('workload-gauge-count').textContent).toBe('0/10');
    });

    it('matches snapshot for float values', () => {
      const { container } = render(<WorkloadGauge current={2.9} max={4.7} label="org assignments" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── partial state ──────────────────────────────────────────────────────────

  describe('partial state', () => {
    it('renders with data-state="partial" when 0 < current < max', () => {
      const { getByTestId } = render(<WorkloadGauge current={3} max={4} />);
      expect(getByTestId('workload-gauge').dataset.state).toBe('partial');
    });

    it('computes fill width correctly (3/4 = 75%)', () => {
      const { getByTestId } = render(<WorkloadGauge current={3} max={4} />);
      expect(getByTestId('workload-gauge-fill').style.width).toBe('75%');
    });

    it('computes fill width for 12/15 (80%)', () => {
      const { getByTestId } = render(<WorkloadGauge current={12} max={15} />);
      expect(getByTestId('workload-gauge-fill').style.width).toBe('80%');
    });

    it('matches snapshot', () => {
      const { container } = render(<WorkloadGauge current={3} max={4} label="org assignments" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  // ── label prop ─────────────────────────────────────────────────────────────

  describe('label prop', () => {
    it('renders label text when provided', () => {
      const { getByTestId } = render(<WorkloadGauge current={2} max={4} label="org assignments" />);
      expect(getByTestId('workload-gauge-label').textContent).toBe('org assignments');
    });

    it('does not render label element when label is omitted', () => {
      const { queryByTestId } = render(<WorkloadGauge current={2} max={4} />);
      expect(queryByTestId('workload-gauge-label')).toBeNull();
    });

    it('includes label in progressbar aria-label', () => {
      const { getByRole } = render(<WorkloadGauge current={3} max={4} label="org assignments" />);
      expect(getByRole('progressbar').getAttribute('aria-label')).toBe('org assignments: 3 of 4');
    });

    it('uses a plain aria-label when no label prop is given', () => {
      const { getByRole } = render(<WorkloadGauge current={3} max={4} />);
      expect(getByRole('progressbar').getAttribute('aria-label')).toBe('3 of 4');
    });
  });
});
