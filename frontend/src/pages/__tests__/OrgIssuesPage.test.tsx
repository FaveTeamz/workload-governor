import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgIssuesPage } from '../OrgIssuesPage';

const mockRefresh = vi.fn();
const mockSetIssueStatus = vi.fn();
const mockSignTransaction = vi.fn();

const mockWallet = {
  publicKey: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  error: null,
  connecting: false,
  networkMismatch: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  signTransaction: mockSignTransaction,
};

const mockIssues = [
  {
    issue_id: '42',
    org_id: 'stellar-org',
    title: 'Fix the withdraw flow',
    status: 'applied' as const,
    reward_xlm: 10,
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ org_id: 'stellar-org' }),
  };
});

vi.mock('../../hooks/useWallet', () => ({
  useWallet: () => mockWallet,
}));

vi.mock('../../hooks/useOrgIssues', () => ({
  useOrgIssues: () => ({
    issues: mockIssues,
    loading: false,
    error: null,
    globalAppCount: 1,
    orgAssignCount: 1,
    refresh: mockRefresh,
    setIssueStatus: mockSetIssueStatus,
  }),
}));

describe('OrgIssuesPage withdraw flow', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockSetIssueStatus.mockReset();
    mockSignTransaction.mockReset();
    mockSignTransaction.mockResolvedValue('signed-xdr');
    mockRefresh.mockResolvedValue(undefined);
    window.confirm = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a signed withdraw transaction and refreshes the issue list', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ xdr: 'unsigned-xdr' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hash: 'txhash123', status: 'SUCCESS' }) });

    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<OrgIssuesPage apiBase="/api" />);

    await user.click(screen.getByRole('button', { name: /withdraw application for: fix the withdraw flow/i }));

    await waitFor(() => expect(mockSignTransaction).toHaveBeenCalledWith('unsigned-xdr'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/transactions/withdraw',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/transactions/submit',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
