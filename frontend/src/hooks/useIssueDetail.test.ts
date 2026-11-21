import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useIssueDetail } from './useIssueDetail';
import type { IssueDetailData } from './useIssueDetail';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_DATA: IssueDetailData = {
  issue: {
    id: 42,
    org_id: 'stellar-org',
    title: 'Fix TTL extension bug',
    body: '## Description\n\nThis is a **bug**.',
    labels: 'bug,good-first-issue',
    github_url: 'https://github.com/stellar/stellar-org/issues/42',
    status: 'open',
    created_at: '2026-06-01T10:00:00Z',
  },
  applicant_count: 3,
  assigned_to: null,
  events: [
    {
      id: 1,
      event_type: 'applied',
      contributor: 'GABC1234',
      actor: 'GABC1234',
      timestamp: '2026-06-02T08:00:00Z',
      tx_hash: 'abc123def456',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useIssueDetail', () => {
  beforeEach(() => {
    mockFetch(MOCK_DATA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading=true and data=null', () => {
    // Don't resolve fetch yet
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useIssueDetail('/api', 'stellar-org', '42'));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('populates data after successful fetch', async () => {
    const { result } = renderHook(() => useIssueDetail('/api', 'stellar-org', '42'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(MOCK_DATA);
    expect(result.current.error).toBeNull();
  });

  it('fetches the correct URL', async () => {
    renderHook(() => useIssueDetail('/api', 'stellar-org', '42'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/issues/stellar-org/42',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('sets error when fetch returns non-ok status', async () => {
    mockFetch({ error: 'Issue not found' }, 404);
    const { result } = renderHook(() => useIssueDetail('/api', 'stellar-org', '999'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Issue not found');
  });

  it('sets error when fetch throws a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    const { result } = renderHook(() => useIssueDetail('/api', 'stellar-org', '42'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network failure');
    expect(result.current.data).toBeNull();
  });

  it('does not fetch when orgId is empty', () => {
    global.fetch = vi.fn();
    renderHook(() => useIssueDetail('/api', '', '42'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when issueId is empty', () => {
    global.fetch = vi.fn();
    renderHook(() => useIssueDetail('/api', 'stellar-org', ''));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refetch() triggers a second fetch', async () => {
    const { result } = renderHook(() => useIssueDetail('/api', 'stellar-org', '42'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    act(() => { result.current.refetch(); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('re-fetches when orgId changes', async () => {
    const { result, rerender } = renderHook(
      ({ org }: { org: string }) => useIssueDetail('/api', org, '42'),
      { initialProps: { org: 'stellar-org' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    rerender({ org: 'meridian-dao' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/issues/meridian-dao/42',
      expect.anything(),
    );
  });

  it('URL-encodes orgId and issueId', async () => {
    renderHook(() => useIssueDetail('/api', 'stellar org', '42'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/issues/stellar%20org/42',
      expect.anything(),
    );
  });
});
