/**
 * #1261: maintainer status comes from the contract's `is_maintainer` view
 * (via GET /orgs/:orgId/maintainers/:address), not a client-side mock.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({ publicKey: null as string | null }));
vi.mock('./useWallet', () => ({ useWallet: () => wallet }));

import {
  fetchIsMaintainer,
  invalidateMaintainerAuthCache,
  useMaintainerAuth,
  useMaintainerStatus,
} from './useMaintainerAuth';

const ADDR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function respond(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

beforeEach(() => {
  wallet.publicKey = null;
  invalidateMaintainerAuthCache(ADDR);
  invalidateMaintainerAuthCache(OTHER);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchIsMaintainer', () => {
  it('queries the maintainer endpoint and returns the contract answer', async () => {
    const fetchMock = respond(200, { is_maintainer: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchIsMaintainer(ADDR, 'org_1', '/api')).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/orgs/org_1/maintainers/${ADDR}`);
  });

  it('returns false for a non-maintainer', async () => {
    vi.stubGlobal('fetch', respond(200, { is_maintainer: false }));
    await expect(fetchIsMaintainer(ADDR, 'org_1')).resolves.toBe(false);
  });

  it('throws when the contract cannot be queried, instead of answering false', async () => {
    vi.stubGlobal('fetch', respond(502, { error: 'contract_unavailable' }));
    await expect(fetchIsMaintainer(ADDR, 'org_1')).rejects.toThrow(/HTTP 502/);
  });
});

describe('useMaintainerStatus', () => {
  it('reports no wallet as not a maintainer without calling the API', async () => {
    const fetchMock = respond(200, { is_maintainer: true });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMaintainerStatus('org_1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({ isMaintainer: false, isLoading: false, error: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is loading, then true for a maintainer wallet', async () => {
    wallet.publicKey = ADDR;
    vi.stubGlobal('fetch', respond(200, { is_maintainer: true }));
    const { result } = renderHook(() => useMaintainerStatus('org_1'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isMaintainer).toBe(false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({ isMaintainer: true, isLoading: false, error: null });
  });

  it('is false for a contributor wallet', async () => {
    wallet.publicKey = OTHER;
    vi.stubGlobal('fetch', respond(200, { is_maintainer: false }));
    const { result } = renderHook(() => useMaintainerStatus('org_1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isMaintainer).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces errors and keeps maintainer controls hidden', async () => {
    wallet.publicKey = ADDR;
    vi.stubGlobal('fetch', respond(502));
    const { result } = renderHook(() => useMaintainerStatus('org_1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isMaintainer).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('re-checks when the wallet disconnects', async () => {
    wallet.publicKey = ADDR;
    vi.stubGlobal('fetch', respond(200, { is_maintainer: true }));
    const { result, rerender } = renderHook(() => useMaintainerStatus('org_1'));
    await waitFor(() => expect(result.current.isMaintainer).toBe(true));
    wallet.publicKey = null;
    rerender();
    await waitFor(() => expect(result.current.isMaintainer).toBe(false));
  });
});

describe('useMaintainerAuth', () => {
  it('maps the contract answer to authorized / forbidden', async () => {
    wallet.publicKey = ADDR;
    vi.stubGlobal('fetch', respond(200, { is_maintainer: true }));
    const authorized = renderHook(() => useMaintainerAuth('org_1'));
    await waitFor(() => expect(authorized.result.current).toBe('authorized'));

    wallet.publicKey = OTHER;
    vi.stubGlobal('fetch', respond(200, { is_maintainer: false }));
    const forbidden = renderHook(() => useMaintainerAuth('org_1'));
    await waitFor(() => expect(forbidden.result.current).toBe('forbidden'));
  });
});
