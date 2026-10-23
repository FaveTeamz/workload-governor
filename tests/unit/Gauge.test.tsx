import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnimatedCount } from '../../frontend/components/AnimatedCount';
import { Gauge } from '../../frontend/src/components/Gauge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flush animation to completion.
 * We stub performance.now to return a value well past the animation
 * duration so the first rAF tick sees progress >= 1 and jumps to the
 * target value immediately (no infinite loop).
 */
async function flushAnimation(duration = 400) {
  await act(async () => {
    vi.spyOn(performance, 'now').mockReturnValue(duration + 100);
    // Run any pending rAF callbacks queued by vi.useFakeTimers
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// AnimatedCount
// ---------------------------------------------------------------------------

describe('AnimatedCount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Stub matchMedia to NOT prefer reduced motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the initial value', () => {
    render(<AnimatedCount value={5} />);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('applies the animated-count class', () => {
    const { container } = render(<AnimatedCount value={3} />);
    expect(container.querySelector('.animated-count')).toBeTruthy();
  });

  it('applies additional className prop', () => {
    const { container } = render(<AnimatedCount value={3} className="my-class" />);
    expect(container.querySelector('.animated-count.my-class')).toBeTruthy();
  });

  it('sets aria-live="polite" for screen readers', () => {
    render(<AnimatedCount value={7} />);
    const span = screen.getByText('7');
    expect(span.getAttribute('aria-live')).toBe('polite');
  });

  it('accepts an aria-label prop', () => {
    render(<AnimatedCount value={3} aria-label="3 of 15" />);
    expect(screen.getByLabelText('3 of 15')).toBeTruthy();
  });

  it('animates to new value on increment', async () => {
    const { rerender } = render(<AnimatedCount value={0} duration={400} />);
    rerender(<AnimatedCount value={5} duration={400} />);
    await flushAnimation(400);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('animates to new value on decrement', async () => {
    const { rerender } = render(<AnimatedCount value={10} duration={400} />);
    rerender(<AnimatedCount value={3} duration={400} />);
    await flushAnimation(400);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('jumps immediately when prefers-reduced-motion is set', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');

    const { rerender } = render(<AnimatedCount value={0} duration={400} />);
    rerender(<AnimatedCount value={8} duration={400} />);
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('8')).toBeTruthy();
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('jumps immediately when duration is 0', async () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');

    const { rerender } = render(<AnimatedCount value={0} duration={0} />);
    rerender(<AnimatedCount value={6} duration={0} />);
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('6')).toBeTruthy();
    expect(rafSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

describe('Gauge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the gauge label', () => {
    render(<Gauge value={3} max={15} label="Global applications" />);
    expect(screen.getByText('Global applications')).toBeTruthy();
  });

  it('renders the max value', () => {
    render(<Gauge value={3} max={15} label="Global applications" />);
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('renders a progressbar with correct ARIA attributes', () => {
    render(<Gauge value={5} max={15} label="Global applications" />);
    const bar = screen.getAllByRole('progressbar')[0];
    expect(bar.getAttribute('aria-valuenow')).toBe('5');
    expect(bar.getAttribute('aria-valuemax')).toBe('15');
  });

  it('wires AnimatedCount — gauge__animated-value class present', () => {
    const { container } = render(<Gauge value={4} max={15} label="Test" />);
    expect(container.querySelector('.gauge__animated-value')).toBeTruthy();
  });

  it('animated-count class is applied to the count span inside gauge', () => {
    const { container } = render(<Gauge value={2} max={4} label="Org" />);
    expect(container.querySelector('.animated-count')).toBeTruthy();
  });

  it('count animates on increment', async () => {
    const { rerender } = render(
      <Gauge value={2} max={15} label="Global" animationDuration={400} />
    );
    rerender(<Gauge value={5} max={15} label="Global" animationDuration={400} />);
    await flushAnimation(400);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('count animates on decrement (withdrawal)', async () => {
    const { rerender } = render(
      <Gauge value={8} max={15} label="Global" animationDuration={400} />
    );
    rerender(<Gauge value={3} max={15} label="Global" animationDuration={400} />);
    await flushAnimation(400);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('animationDuration=0 produces immediate jump without rAF', async () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const { rerender } = render(<Gauge value={0} max={10} label="T" animationDuration={0} />);
    rerender(<Gauge value={5} max={10} label="T" animationDuration={0} />);
    await act(async () => { await Promise.resolve(); });
    expect(rafSpy).not.toHaveBeenCalled();
    expect(screen.getByText('5')).toBeTruthy();
  });
});
