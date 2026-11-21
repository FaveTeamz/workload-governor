import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCopyToClipboard } from './useCopyToClipboard';

// ── helpers ──────────────────────────────────────────────────────────────────

function mockClipboardWriteText(impl: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(impl) },
    writable: true,
    configurable: true,
  });
}

function removeClipboardApi() {
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

/** jsdom does not implement execCommand; define a stub so vi.spyOn can replace it. */
function stubExecCommand(returnValue: boolean) {
  // Define the property if it's missing (jsdom omits it)
  if (!('execCommand' in document)) {
    Object.defineProperty(document, 'execCommand', {
      value: () => returnValue,
      writable: true,
      configurable: true,
    });
  }
  return vi.spyOn(document, 'execCommand').mockReturnValue(returnValue);
}

// ── useCopyToClipboard ────────────────────────────────────────────────────────

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockClipboardWriteText(() => Promise.resolve());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initial state: copied=false, error=null', () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('copy() calls navigator.clipboard.writeText with the given text', async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('hello'); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('copy() sets copied=true on success', async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('hello'); });
    expect(result.current.copied).toBe(true);
  });

  it('copy() returns true on success', async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    let returnValue: boolean | undefined;
    await act(async () => { returnValue = await result.current.copy('hello'); });
    expect(returnValue).toBe(true);
  });

  it('copied resets to false after exactly 2000 ms', async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('hello'); });
    expect(result.current.copied).toBe(true);

    act(() => { vi.advanceTimersByTime(1999); });
    expect(result.current.copied).toBe(true);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.copied).toBe(false);
  });

  it('error is null after a successful copy', async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('hello'); });
    expect(result.current.error).toBeNull();
  });

  it('sets error when clipboard API rejects', async () => {
    const rejection = new Error('Permission denied');
    mockClipboardWriteText(() => Promise.reject(rejection));
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => { await result.current.copy('hello'); });
    expect(result.current.error).toBe(rejection);
    expect(result.current.copied).toBe(false);
  });

  it('copy() returns false when clipboard API rejects', async () => {
    mockClipboardWriteText(() => Promise.reject(new Error('denied')));
    const { result } = renderHook(() => useCopyToClipboard());

    let returnValue: boolean | undefined;
    await act(async () => { returnValue = await result.current.copy('hello'); });
    expect(returnValue).toBe(false);
  });

  it('clears a previous error on the next copy attempt', async () => {
    mockClipboardWriteText(() => Promise.reject(new Error('denied')));
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('hello'); });
    expect(result.current.error).not.toBeNull();

    // restore success
    mockClipboardWriteText(() => Promise.resolve());
    await act(async () => { await result.current.copy('hello'); });
    expect(result.current.error).toBeNull();
  });

  it('falls back to execCommand when navigator.clipboard is unavailable', async () => {
    removeClipboardApi();
    const execCommandSpy = stubExecCommand(true);

    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('fallback text'); });

    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets error when execCommand fallback returns false', async () => {
    removeClipboardApi();
    stubExecCommand(false);

    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('fallback text'); });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.copied).toBe(false);
  });

  it('pending reset timer is cancelled when copy is called again before 2s', async () => {
    const { result } = renderHook(() => useCopyToClipboard());

    // First copy
    await act(async () => { await result.current.copy('first'); });
    expect(result.current.copied).toBe(true);

    // Advance 1 second (still copied)
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.copied).toBe(true);

    // Second copy resets the timer
    await act(async () => { await result.current.copy('second'); });
    expect(result.current.copied).toBe(true);

    // Advance to what would have been the original timeout
    act(() => { vi.advanceTimersByTime(1000); });
    // Still copied because a fresh 2s timer started on second copy
    expect(result.current.copied).toBe(true);

    // Advance the remaining 1s to complete the new timer
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.copied).toBe(false);
  });
});
