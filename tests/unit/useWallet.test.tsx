import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWallet } from '../../frontend/src/hooks/useWallet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'wg_wallet_pubkey';
const MOCK_ADDRESS = 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12';

function setFreighter(impl: Record<string, unknown> | null) {
  (globalThis as Record<string, unknown>)['__freighter_api__'] = impl;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  setFreighter(null);
  vi.spyOn(window, 'addEventListener');
  vi.spyOn(window, 'removeEventListener');
});

afterEach(() => {
  setFreighter(null);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWallet', () => {
  it('connect sets publicKey in state', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
    });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(MOCK_ADDRESS);
    expect(result.current.error).toBeNull();
  });

  it('disconnect clears publicKey state and localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, MOCK_ADDRESS);
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
    });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.publicKey).toBe(MOCK_ADDRESS);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('missing extension sets error state', async () => {
    setFreighter(null);
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.error).toMatch(/freighter/i);
  });

  it('publicKey persists after page reload simulation', () => {
    localStorage.setItem(STORAGE_KEY, MOCK_ADDRESS);
    const { result } = renderHook(() => useWallet());
    expect(result.current.publicKey).toBe(MOCK_ADDRESS);
  });

  // ── #545 event listener cleanup ─────────────────────────────────────────

  it('attaches a message listener on mount', () => {
    renderHook(() => useWallet());
    expect(window.addEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
  });

  it('removes the message listener on unmount (no leak)', () => {
    const { unmount } = renderHook(() => useWallet());

    // Capture the handler that was registered
    const addCalls = (window.addEventListener as ReturnType<typeof vi.spyOn>).mock.calls;
    const [, registeredHandler] = addCalls.find(([event]) => event === 'message') ?? [];

    unmount();

    expect(window.removeEventListener).toHaveBeenCalledWith(
      'message',
      registeredHandler
    );
  });

  it('does not accumulate listeners across mount/unmount cycles', () => {
    const { unmount: unmount1 } = renderHook(() => useWallet());
    unmount1();

    const { unmount: unmount2 } = renderHook(() => useWallet());
    unmount2();

    // Each mount adds one listener; each unmount removes it.
    // So add and remove counts should be equal.
    const addCount = (window.addEventListener as ReturnType<typeof vi.spyOn>).mock.calls
      .filter(([event]) => event === 'message').length;
    const removeCount = (window.removeEventListener as ReturnType<typeof vi.spyOn>).mock.calls
      .filter(([event]) => event === 'message').length;

    expect(addCount).toBe(removeCount);
  });

  it('updates publicKey when FREIGHTER_ACCOUNT_CHANGED message is received', async () => {
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'FREIGHTER_ACCOUNT_CHANGED', detail: { publicKey: MOCK_ADDRESS } },
        })
      );
    });

    expect(result.current.publicKey).toBe(MOCK_ADDRESS);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(MOCK_ADDRESS);
  });

  it('clears publicKey when FREIGHTER_DISCONNECTED message is received', async () => {
    localStorage.setItem(STORAGE_KEY, MOCK_ADDRESS);
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'FREIGHTER_DISCONNECTED' },
        })
      );
    });

    expect(result.current.publicKey).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
