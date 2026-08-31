import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SlideOutRow from '../../../components/SlideOutRow';

describe('SlideOutRow', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? true : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('removes its content immediately when reduced motion is preferred', () => {
    const onRemoved = vi.fn();

    const { container } = render(
      <SlideOutRow isRemoved onRemoved={onRemoved}>
        <div>Fade me away</div>
      </SlideOutRow>
    );

    expect(container.firstChild).toBeNull();
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Fade me away')).toBeNull();
  });
});
