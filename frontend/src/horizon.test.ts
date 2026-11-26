import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNetworkHealth } from './horizon';

afterEach(() => vi.restoreAllMocks());

describe('fetchNetworkHealth', () => {
  it('reads network health from the mocked backend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ rpcAvailable: true, latencyMs: 12 })),
    );

    await expect(fetchNetworkHealth()).resolves.toEqual({ rpcAvailable: true, latencyMs: 12 });
    expect(fetchMock).toHaveBeenCalledWith('/api/health/network', { signal: expect.any(AbortSignal) });
  });
});
