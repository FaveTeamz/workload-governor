import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gauge } from './Gauge';

describe('Gauge', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: true })));
  afterEach(() => vi.unstubAllGlobals());

  it.each([0, 5, 10, 15])('renders %i pending applications', (value) => {
    const { container } = render(
      <Gauge value={value} max={15} label="Global Applications" animationDuration={0} />,
    );
    expect(screen.getByRole('progressbar', { name: `Global Applications: ${value} of 15` }).getAttribute('aria-valuenow'))
      .toBe(String(value));
    expect(container).toMatchSnapshot();
  });

  it('updates the displayed count and accessible value when the workload changes', () => {
    const { rerender } = render(<Gauge value={2} max={4} label="Org Assignments" animationDuration={0} />);
    rerender(<Gauge value={3} max={4} label="Org Assignments" animationDuration={0} />);
    expect(screen.getByRole('progressbar', { name: 'Org Assignments: 3 of 4' }).getAttribute('aria-valuemax'))
      .toBe('4');
    expect(screen.getByText('3')).toBeTruthy();
  });
});
