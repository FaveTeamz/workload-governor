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
    // Seed storage and freighter
    localStorage.setItem(STORAGE_KEY, MOCK_ADDRESS);
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
    });

    const { result } = renderHook(() => useWallet());

    // First connect to set state
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(MOCK_ADDRESS);

    // Then disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('missing extension sets error state', async () => {
    // No freighter injected (null)
    setFreighter(null);

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(result.current.error).toMatch(/freighter/i);
  });

  it('publicKey persists after page reload simulation', () => {
    // Simulate prior session by pre-seeding localStorage before hook mounts
    localStorage.setItem(STORAGE_KEY, MOCK_ADDRESS);

    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBe(MOCK_ADDRESS);
  });

  it('network mismatch sets networkMismatch flag', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
      getNetwork: vi.fn().mockResolvedValue({ network: 'PUBLIC', networkPassphrase: 'Public Global Stellar Network ; September 2015' }),
    });

    // Force expected network to TESTNET
    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');

    const { result } = renderHook(() => useWallet());
    await act(async () => { await result.current.connect(); });

    expect(result.current.publicKey).toBe(MOCK_ADDRESS);
    expect(result.current.networkMismatch).toBe(true);

    vi.unstubAllEnvs();
  });

  it('matching network leaves networkMismatch false', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
      getNetwork: vi.fn().mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' }),
    });

    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');

    const { result } = renderHook(() => useWallet());
    await act(async () => { await result.current.connect(); });

    expect(result.current.networkMismatch).toBe(false);

    vi.unstubAllEnvs();
  });

  it('disconnect resets networkMismatch', async () => {
    setFreighter({
      isConnected: vi.fn().mockResolvedValue({ isConnected: true }),
      getAddress: vi.fn().mockResolvedValue({ address: MOCK_ADDRESS, error: undefined }),
      getNetwork: vi.fn().mockResolvedValue({ network: 'PUBLIC', networkPassphrase: '' }),
    });

    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');

    const { result } = renderHook(() => useWallet());
    await act(async () => { await result.current.connect(); });
    expect(result.current.networkMismatch).toBe(true);

    act(() => { result.current.disconnect(); });
    expect(result.current.networkMismatch).toBe(false);

    vi.unstubAllEnvs();
  });
});
