import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the entire @stellar/freighter-api module BEFORE importing useWallet
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  isAllowed: vi.fn(),
  setAllowed: vi.fn(),
}));

import * as freighterApi from '@stellar/freighter-api';
import { useWallet } from './useWallet';

const STORAGE_KEY = 'wg_wallet_pubkey';
const TEST_PUBKEY = 'GBABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRST';

// Typed helpers for the mocked functions
const mockIsConnected = vi.mocked(freighterApi.isConnected);
const mockGetAddress = vi.mocked(freighterApi.getAddress);
const mockGetNetwork = vi.mocked(freighterApi.getNetwork);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Default: Freighter installed, on the right network
  mockIsConnected.mockResolvedValue({ isConnected: true });
  mockGetAddress.mockResolvedValue({ address: TEST_PUBKEY });
  mockGetNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' });
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// connect() — Freighter not installed
// ---------------------------------------------------------------------------
describe('connect() when Freighter is not installed', () => {
  it('sets error with install message and marks isInstalled=false', async () => {
    mockIsConnected.mockResolvedValue({ isConnected: false, error: 'Not installed' });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isInstalled).toBe(false);
    expect(result.current.error).toMatch(/install/i);
    expect(result.current.publicKey).toBeNull();
    expect(result.current.connecting).toBe(false);
  });

  it('sets error when isConnected returns an error field', async () => {
    mockIsConnected.mockResolvedValue({ isConnected: false, error: 'Extension not found' });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isInstalled).toBe(false);
    expect(result.current.error).toMatch(/install/i);
  });
});

// ---------------------------------------------------------------------------
// connect() — user rejects / getAddress returns an error
// ---------------------------------------------------------------------------
describe('connect() when user rejects', () => {
  it('sets error with the rejection message', async () => {
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockGetAddress.mockResolvedValue({ address: '', error: 'User declined access' });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBe('User declined access');
    expect(result.current.publicKey).toBeNull();
    expect(result.current.connecting).toBe(false);
  });

  it('sets error when an exception is thrown', async () => {
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockGetAddress.mockRejectedValue(new Error('User rejected request'));

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBe('User rejected request');
    expect(result.current.publicKey).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// connect() — success
// ---------------------------------------------------------------------------
describe('connect() success', () => {
  it('stores publicKey and clears error', async () => {
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.publicKey).toBe(TEST_PUBKEY);
    expect(result.current.error).toBeNull();
    expect(result.current.connecting).toBe(false);
    expect(result.current.isInstalled).toBe(true);
  });

  it('persists the publicKey to localStorage', async () => {
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe(TEST_PUBKEY);
  });

  it('clears a prior error on successful connect', async () => {
    // First connect fails
    mockIsConnected.mockResolvedValueOnce({ isConnected: false, error: 'Not installed' });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).not.toBeNull();

    // Second connect succeeds
    mockIsConnected.mockResolvedValue({ isConnected: true });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.publicKey).toBe(TEST_PUBKEY);
  });
});

// ---------------------------------------------------------------------------
// connect() — network mismatch
// ---------------------------------------------------------------------------
describe('connect() with network mismatch', () => {
  it('sets networkMismatch=true when wallet network differs from expected', async () => {
    mockGetNetwork.mockResolvedValue({ network: 'MAINNET', networkPassphrase: 'Public Global Stellar Network ; September 2015' });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.networkMismatch).toBe(true);
    // publicKey is still set even on mismatch so user can see the issue
    expect(result.current.publicKey).toBe(TEST_PUBKEY);
  });

  it('does not set networkMismatch when network matches', async () => {
    mockGetNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.networkMismatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------
describe('disconnect()', () => {
  it('clears publicKey from state and localStorage', async () => {
    const { result } = renderHook(() => useWallet());

    // Connect first
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.publicKey).toBe(TEST_PUBKEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(TEST_PUBKEY);

    // Disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.publicKey).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears error and networkMismatch on disconnect', async () => {
    mockGetNetwork.mockResolvedValue({ network: 'MAINNET', networkPassphrase: '' });
    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.networkMismatch).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.networkMismatch).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Auto-reconnect
// ---------------------------------------------------------------------------
describe('auto-reconnect', () => {
  it('populates publicKey from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY, TEST_PUBKEY);

    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBe(TEST_PUBKEY);
  });

  it('starts with null publicKey when localStorage is empty', () => {
    const { result } = renderHook(() => useWallet());

    expect(result.current.publicKey).toBeNull();
  });
});
