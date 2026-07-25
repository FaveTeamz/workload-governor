/**
 * tests/unit/useWallet.test.tsx
 *
 * Issue #375 — useWallet hook unit tests
 *
 * Covers all 5 connection states + auto-reconnect:
 *  1. Freighter not installed → { installed: false, connected: false }
 *  2. Freighter installed but not connected → { installed: true, connected: false }
 *  3. Successful connection → { installed: true, connected: true, publicKey }
 *  4. Wrong network → { connected: true, networkMismatch: true }
 *  5. User rejects connection → { connected: false, error: 'user_rejected' }
 *  6. Auto-reconnect on page load when previously connected
 *
 * @stellar/freighter-api is fully mocked — no real extension required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWallet } from '../../frontend/src/hooks/useWallet';

// ── Mock @stellar/freighter-api ───────────────────────────────────────────────

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  getPublicKey: vi.fn(),
  requestAccess: vi.fn(),
  getNetwork: vi.fn(),
}));

import {
  isConnected,
  isAllowed,
  getPublicKey,
  requestAccess,
  getNetwork,
} from '@stellar/freighter-api';

// Type-cast the mocks so TypeScript is happy
const mockIsConnected = isConnected as ReturnType<typeof vi.fn>;
const mockIsAllowed = isAllowed as ReturnType<typeof vi.fn>;
const mockGetPublicKey = getPublicKey as ReturnType<typeof vi.fn>;
const mockRequestAccess = requestAccess as ReturnType<typeof vi.fn>;
const mockGetNetwork = getNetwork as ReturnType<typeof vi.fn>;

// ── Fake test data ────────────────────────────────────────────────────────────

const TEST_PUBLIC_KEY = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGXMQ2RDTQE872DKYZ7N3X';
const STORAGE_KEY = 'wg_wallet_connected';

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Reset all mocks and localStorage before each test */
function resetAll() {
  vi.clearAllMocks();
  localStorage.clear();
}

/** Set Freighter mocks for "not installed" */
function mockNotInstalled() {
  mockIsConnected.mockRejectedValue(new Error('Freighter not installed'));
}

/** Set Freighter mocks for "installed but not connected / not allowed" */
function mockInstalledNotConnected() {
  mockIsConnected.mockResolvedValue({ isConnected: true });
  mockIsAllowed.mockResolvedValue({ isAllowed: false });
}

/** Set Freighter mocks for a fully connected, correct-network state */
function mockConnected(network = 'TESTNET') {
  mockIsConnected.mockResolvedValue({ isConnected: true });
  mockIsAllowed.mockResolvedValue({ isAllowed: true });
  mockGetPublicKey.mockResolvedValue({ publicKey: TEST_PUBLIC_KEY });
  mockGetNetwork.mockResolvedValue({ network });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('useWallet hook (Issue #375)', () => {
  beforeEach(resetAll);
  afterEach(() => vi.restoreAllMocks());

  // ── Test 1: not installed ─────────────────────────────────────────────────

  it('1. returns { installed: false, connected: false } when Freighter is not installed', async () => {
    mockNotInstalled();

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.installed).toBe(false);
    expect(result.current.connected).toBe(false);
    expect(result.current.publicKey).toBeUndefined();
  });

  // ── Test 2: installed but not connected ───────────────────────────────────

  it('2. returns { installed: true, connected: false } when not yet allowed', async () => {
    mockInstalledNotConnected();

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.installed).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(result.current.publicKey).toBeUndefined();
  });

  // ── Test 3: successful connection ─────────────────────────────────────────

  it('3. returns { installed: true, connected: true, publicKey } on successful connection', async () => {
    mockConnected('TESTNET');

    const { result } = renderHook(() => useWallet());

    // Trigger connect() manually to simulate user clicking "Connect"
    await act(async () => {
      mockRequestAccess.mockResolvedValue({ publicKey: TEST_PUBLIC_KEY });
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.installed).toBe(true);
    expect(result.current.connected).toBe(true);
    expect(result.current.publicKey).toBe(TEST_PUBLIC_KEY);
    expect(result.current.networkMismatch).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  // ── Test 4: wrong network ─────────────────────────────────────────────────

  it('4. returns { connected: true, networkMismatch: true } when on the wrong network', async () => {
    // Mock Freighter returning MAINNET instead of expected TESTNET
    mockConnected('PUBLIC'); // PUBLIC = mainnet

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      mockRequestAccess.mockResolvedValue({ publicKey: TEST_PUBLIC_KEY });
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.connected).toBe(true);
    expect(result.current.publicKey).toBe(TEST_PUBLIC_KEY);
    expect(result.current.networkMismatch).toBe(true);
  });

  // ── Test 5: user rejects connection ──────────────────────────────────────

  it('5. returns { connected: false, error: "user_rejected" } when user denies access', async () => {
    mockIsConnected.mockResolvedValue({ isConnected: true });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      // Simulate Freighter throwing a "User rejected" error
      mockRequestAccess.mockRejectedValue(new Error('User rejected the connection request'));
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe('user_rejected');
    expect(result.current.publicKey).toBeUndefined();
  });

  // ── Test 6: auto-reconnect ────────────────────────────────────────────────

  it('6. auto-reconnects on mount when localStorage contains the connected flag', async () => {
    // Simulate that the user was previously connected
    localStorage.setItem(STORAGE_KEY, 'true');
    mockConnected('TESTNET');

    const { result } = renderHook(() => useWallet());

    // Should auto-reconnect without user action
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.connected).toBe(true);
    expect(result.current.publicKey).toBe(TEST_PUBLIC_KEY);
    // isConnected / isAllowed / getPublicKey should have been called automatically
    expect(mockIsConnected).toHaveBeenCalled();
    expect(mockIsAllowed).toHaveBeenCalled();
    expect(mockGetPublicKey).toHaveBeenCalled();
  });

  // ── Bonus: disconnect clears state ───────────────────────────────────────

  it('disconnect() clears connected state and removes localStorage key', async () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    mockConnected('TESTNET');

    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.publicKey).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
