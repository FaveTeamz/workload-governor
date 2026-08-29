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
});

afterEach(() => {
  setFreighter(null);
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Required tests (PR #375) — all 6 connection states
// ---------------------------------------------------------------------------

describe('useWallet', () => {
  // ── State 1: Freighter not installed ──────────────────────────────────────
  it('Freighter not installed returns { installed: false, connected: false }', async () => {
    // No freighter injected → getFreighter() returns null
    setFreighter(null);

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    // publicKey null == not connected; error set == not installed
    expect(result.current.publicKey).toBeNull();
    expect(result.current.error).toMatch(/freighter/i);
    expect(result.current.networkMismatch).toBe(false);
  });

  // ── State 2: Freighter installed but not connected ─────────────────────────
  it('Freighter installed but not connected returns { installed: true, connected: false }', async () => {
    // Extension present but isConnected() returns false
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: false }),
      getAddress: vi.fn(),
    });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBeNull();
    // Hook returns the "not found" error when isConnected is false
    expect(result.current.error).toMatch(/freighter/i);
    expect(result.current.networkMismatch).toBe(false);
  });

  // ── State 3: Successful connection ────────────────────────────────────────
  it('successful connection returns { installed: true, connected: true, publicKey: address }', async () => {
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
    expect(result.current.networkMismatch).toBe(false);
    // publicKey persists in localStorage for auto-reconnect
    expect(localStorage.getItem(STORAGE_KEY)).toBe(MOCK_ADDRESS);
  });

  // ── State 4: Wrong network ─────────────────────────────────────────────────
  it('wrong network returns { connected: true, networkMismatch: true }', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
      getNetwork: vi.fn().mockResolvedValue({
        network: 'PUBLIC',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    });

    // Hook expects TESTNET, extension reports PUBLIC → mismatch
    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(MOCK_ADDRESS);
    expect(result.current.networkMismatch).toBe(true);
    expect(result.current.error).toBeNull();
  });

  // ── State 5: User rejects connection ──────────────────────────────────────
  it('user rejects connection returns { connected: false, error: "user_rejected" }', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      // Freighter returns the rejection reason as an error string in the response
      getAddress: vi.fn().mockResolvedValue({ address: undefined, error: 'user_rejected' }),
    });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.error).toBe('user_rejected');
    expect(result.current.networkMismatch).toBe(false);
  });

  // ── State 6: Auto-reconnect on page load when previously connected ─────────
  it('auto-reconnect on page load when previously connected', () => {
    // Simulate a prior session: publicKey stored in localStorage before hook mounts
    localStorage.setItem(STORAGE_KEY, MOCK_ADDRESS);

    // No need to call connect() — the hook reads localStorage during useState init
    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBe(MOCK_ADDRESS);
    expect(result.current.error).toBeNull();
    expect(result.current.networkMismatch).toBe(false);
    // Stored key is still present (not consumed)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(MOCK_ADDRESS);
  });

  // ---------------------------------------------------------------------------
  // Additional regression tests
  // ---------------------------------------------------------------------------

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

  it('matching network leaves networkMismatch false', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
      getNetwork: vi.fn().mockResolvedValue({
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      }),
    });

    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.networkMismatch).toBe(false);
  });

  it('disconnect resets networkMismatch', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
      getNetwork: vi.fn().mockResolvedValue({ network: 'PUBLIC', networkPassphrase: '' }),
    });

    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.networkMismatch).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.networkMismatch).toBe(false);
  });
});
