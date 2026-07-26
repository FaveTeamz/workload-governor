import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyButton } from './CopyButton';

// ── helpers ──────────────────────────────────────────────────────────────────

function mockClipboard(impl: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(impl) },
    writable: true,
    configurable: true,
  });
}

// ── CopyButton ────────────────────────────────────────────────────────────────

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockClipboard(() => Promise.resolve());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders a button with default aria-label "Copy"', () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('applies a custom label as aria-label', () => {
    render(<CopyButton text="hello" label="Copy address" />);
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy();
  });

  it('renders an aria-live region for announcements', () => {
    render(<CopyButton text="hello" />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live!.textContent).toBe('');
  });

  it('passes extra props like className to the button', () => {
    render(<CopyButton text="hello" className="my-btn" />);
    const btn = screen.getByRole('button');
    expect(btn.classList.contains('my-btn')).toBe(true);
  });

  // ── Copy interaction ──────────────────────────────────────────────────────

  it('calls clipboard.writeText with the provided text on click', async () => {
    render(<CopyButton text="0xABCDEF" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0xABCDEF');
  });

  it('shows copiedLabel in aria-label for 2 seconds after copy', async () => {
    render(<CopyButton text="hello" label="Copy" copiedLabel="Copied!" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('adds copy-btn--copied class during copied state', async () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole('button');
    await act(async () => { fireEvent.click(btn); });
    expect(btn.classList.contains('copy-btn--copied')).toBe(true);
  });

  it('removes copy-btn--copied class after 2 seconds', async () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole('button');
    await act(async () => { fireEvent.click(btn); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(btn.classList.contains('copy-btn--copied')).toBe(false);
  });

  // ── Screen reader announcement ─────────────────────────────────────────────

  it('populates the aria-live region with copiedLabel after copy', async () => {
    render(<CopyButton text="hello" copiedLabel="Copied" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    const live = document.querySelector('[aria-live="polite"]');
    expect(live!.textContent).toBe('Copied');
  });

  it('clears the aria-live region after 2 seconds', async () => {
    render(<CopyButton text="hello" copiedLabel="Copied" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    act(() => { vi.advanceTimersByTime(2000); });

    const live = document.querySelector('[aria-live="polite"]');
    expect(live!.textContent).toBe('');
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows errorLabel in aria-label when copy fails', async () => {
    mockClipboard(() => Promise.reject(new Error('Permission denied')));
    render(<CopyButton text="hello" errorLabel="Failed!" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    expect(screen.getByRole('button', { name: 'Failed!' })).toBeTruthy();
  });

  it('adds copy-btn--error class on failure', async () => {
    mockClipboard(() => Promise.reject(new Error('Permission denied')));
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole('button');
    await act(async () => { fireEvent.click(btn); });
    expect(btn.classList.contains('copy-btn--error')).toBe(true);
  });

  it('populates aria-live region with error info on failure', async () => {
    mockClipboard(() => Promise.reject(new Error('Permission denied')));
    render(<CopyButton text="hello" errorLabel="Copy failed" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });

    const live = document.querySelector('[aria-live="polite"]');
    expect(live!.textContent).toContain('Copy failed');
    expect(live!.textContent).toContain('Permission denied');
  });

  // ── Button is accessible ──────────────────────────────────────────────────

  it('button has type="button" to prevent accidental form submission', () => {
    render(<CopyButton text="hello" />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('type')).toBe('button');
  });
});
