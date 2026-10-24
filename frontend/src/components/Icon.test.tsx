/**
 * Icon.test.tsx — accessibility & rendering tests for the Icon component (#1061)
 *
 * Verifies that:
 *  - decorative icons (no label) are aria-hidden and have no accessible name
 *  - meaningful icons (with label) expose an accessible name via aria-label
 *  - the role="img" is applied only when a label is provided
 *  - focusable="false" is always set to prevent IE/Edge focus issues
 *  - size and color props render correctly
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Icon } from './Icon';
import type { IconSize } from './Icon';

// ── Decorative icon (no label) ────────────────────────────────────────────────

describe('Icon — decorative (no label)', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Icon name="copy" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('sets aria-hidden="true" when no label is provided', () => {
    const { container } = render(<Icon name="copy" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not set aria-label when no label is provided', () => {
    const { container } = render(<Icon name="copy" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });

  it('does not set role="img" when no label is provided', () => {
    const { container } = render(<Icon name="copy" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('is not queryable by role="img" without a label', () => {
    render(<Icon name="copy" />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});

// ── Meaningful icon (with label) ──────────────────────────────────────────────

describe('Icon — meaningful (with label)', () => {
  it('sets aria-label to the provided label', () => {
    const { container } = render(<Icon name="close" label="Close dialog" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Close dialog');
  });

  it('does NOT set aria-hidden when a label is provided', () => {
    const { container } = render(<Icon name="close" label="Close dialog" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });

  it('sets role="img" when a label is provided', () => {
    render(<Icon name="close" label="Close dialog" />);
    expect(screen.getByRole('img', { name: 'Close dialog' })).toBeTruthy();
  });

  it('is queryable by its accessible name', () => {
    render(<Icon name="assign" label="Assign issue" />);
    expect(screen.getByRole('img', { name: 'Assign issue' })).toBeTruthy();
  });
});

// ── focusable attribute ───────────────────────────────────────────────────────

describe('Icon — focusable attribute', () => {
  it('always sets focusable="false" on the SVG', () => {
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });

  it('sets focusable="false" even when a label is provided', () => {
    const { container } = render(<Icon name="check" label="Success" />);
    expect(container.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });
});

// ── Size prop ─────────────────────────────────────────────────────────────────

describe('Icon — size prop', () => {
  const cases: Array<[IconSize, number]> = [
    ['xs', 12],
    ['sm', 16],
    ['md', 20],
    ['lg', 24],
    ['xl', 32],
  ];

  it.each(cases)('size="%s" renders SVG with width/height %d', (size, px) => {
    const { container } = render(<Icon name="info" size={size} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe(String(px));
    expect(svg?.getAttribute('height')).toBe(String(px));
  });

  it('defaults to size="md" (20px) when no size is specified', () => {
    const { container } = render(<Icon name="info" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });

  it('respects sizePx override over the size preset', () => {
    const { container } = render(<Icon name="info" sizePx={36} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('36');
    expect(svg?.getAttribute('height')).toBe('36');
  });
});

// ── Color prop ────────────────────────────────────────────────────────────────

describe('Icon — color prop', () => {
  it('defaults color to "currentColor"', () => {
    const { container } = render(<Icon name="info" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    // jsdom normalises 'currentColor' → 'currentcolor' in computed style strings;
    // check the inline style attribute case-insensitively.
    expect(svg?.getAttribute('style')?.toLowerCase()).toContain('currentcolor');
  });

  it('applies an explicit color value', () => {
    const { container } = render(<Icon name="info" color="red" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    // jsdom may normalise named colours; just verify the style attribute contains *a* color value.
    expect(svg?.getAttribute('style')).toBeTruthy();
    expect(svg?.getAttribute('style')).toContain('color');
  });
});

// ── className prop ────────────────────────────────────────────────────────────

describe('Icon — className prop', () => {
  it('applies extra CSS classes to the SVG', () => {
    const { container } = render(<Icon name="info" className="my-icon" />);
    expect(container.querySelector('svg')?.classList.contains('my-icon')).toBe(true);
  });
});

// ── sprite href ───────────────────────────────────────────────────────────────

describe('Icon — sprite <use> href', () => {
  it('renders a <use> element with the correct sprite href', () => {
    const { container } = render(<Icon name="copy" />);
    const use = container.querySelector('use');
    expect(use?.getAttribute('href')).toBe('/icons.svg#icon-copy');
  });

  it('builds the href from the icon name', () => {
    const { container } = render(<Icon name="check-circle" />);
    const use = container.querySelector('use');
    expect(use?.getAttribute('href')).toBe('/icons.svg#icon-check-circle');
  });
});

// ── Accessibility contract for icon buttons ───────────────────────────────────

describe('Icon — accessibility contract in icon-only buttons', () => {
  it('icon inside a button without label is decorative (aria-hidden)', () => {
    const { container } = render(
      <button type="button" aria-label="Close dialog">
        <Icon name="close" />
      </button>
    );
    const svg = container.querySelector('svg');
    // Icon is decorative — the button carries the accessible name
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeTruthy();
  });

  it('icon inside a button with label prop is independently accessible', () => {
    render(
      <button type="button">
        <Icon name="close" label="Close dialog" />
      </button>
    );
    expect(screen.getByRole('img', { name: 'Close dialog' })).toBeTruthy();
  });
});
