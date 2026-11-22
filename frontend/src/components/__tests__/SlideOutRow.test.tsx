import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SlideOutRow from '../../../components/SlideOutRow';

describe('SlideOutRow (Issue #854 / FE-019)', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  function mockMatchMedia(reducedMotion: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  it('renders children and enforces overflow-x: hidden on container', () => {
    mockMatchMedia(false);
    render(
      <SlideOutRow>
        <div>Row content</div>
      </SlideOutRow>
    );

    const container = screen.getByTestId('slide-out-row-container');
    expect(container).toBeInTheDocument();
    expect(container).toHaveStyle({ overflowX: 'hidden' });
    expect(screen.getByText('Row content')).toBeInTheDocument();
  });

  it('removes its content immediately when reduced motion is preferred', () => {
    mockMatchMedia(true);
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

  it('triggers slide-out animation with will-change styles when isRemoved becomes true', () => {
    mockMatchMedia(false);
    const onRemoved = vi.fn();

    render(
      <SlideOutRow isRemoved onRemoved={onRemoved}>
        <div>Animated row</div>
      </SlideOutRow>
    );

    const content = screen.getByTestId('slide-out-row-content');
    expect(content).toHaveClass('slide-out');
    expect(content).toHaveStyle({ willChange: 'transform, opacity' });
  });

  it('calls onRemoved lifecycle callback when animation ends', () => {
    mockMatchMedia(false);
    const onRemoved = vi.fn();

    render(
      <SlideOutRow isRemoved onRemoved={onRemoved}>
        <div>Animated row</div>
      </SlideOutRow>
    );

    const content = screen.getByTestId('slide-out-row-content');
    expect(onRemoved).not.toHaveBeenCalled();

    // Fire animationend event
    fireEvent.animationEnd(content);

    expect(onRemoved).toHaveBeenCalledTimes(1);
  });
});
