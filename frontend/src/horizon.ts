export interface NetworkHealthSnapshot {
  rpcAvailable: boolean;
  latencyMs: number | null;
}

export async function fetchNetworkHealth(): Promise<NetworkHealthSnapshot> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    const response = await fetch('/api/health/network', { signal: controller.signal });
    window.clearTimeout(timeout);

    if (!response.ok) {
      return { rpcAvailable: false, latencyMs: null };
    }

    const payload = (await response.json()) as { rpcAvailable?: boolean; latencyMs?: number | null };
    return {
      rpcAvailable: payload.rpcAvailable ?? false,
      latencyMs: typeof payload.latencyMs === 'number' ? payload.latencyMs : null,
    };
  } catch {
    return { rpcAvailable: false, latencyMs: null };
  }
}
