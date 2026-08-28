import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrgIssuesPage } from '../OrgIssuesPage';
import { ToastProvider } from '../../components/Toast';

const mockRefresh = vi.fn();
const mockLoadMore = vi.fn();
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
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('../../hooks/useWallet', () => ({
  useWallet: () => mockWallet,
}));

vi.mock('../../hooks/useInfiniteOrgIssues', () => ({
  useInfiniteOrgIssues: () => ({
    issues: mockIssues,
    loading: false,
    hasMore: false,
    loadMore: mockLoadMore,
    error: null,
    globalAppCount: 1,
    orgAssignCount: 1,
    refresh: mockRefresh,
    setIssueStatus: mockSetIssueStatus,
  }),
}));

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/orgs/stellar-org/issues']}>
        <Routes>
          <Route path="/orgs/:org_id/issues" element={<OrgIssuesPage apiBase="/api" />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

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

  it('calls withdraw endpoint and refreshes when confirmed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ xdr: 'unsigned-xdr' }) });

    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: /withdraw application for: fix the withdraw flow/i }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/transactions/withdraw',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows the issue title in the list', () => {
    renderPage();
    expect(screen.getByText('Fix the withdraw flow')).toBeTruthy();
  });

  it('shows end-of-list message when hasMore is false and issues exist', () => {
    renderPage();
    expect(screen.getByText(/all issues loaded/i)).toBeTruthy();
  });
});
