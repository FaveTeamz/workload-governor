import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgIssuesPage } from '../OrgIssuesPage';
import { ToastProvider } from '../../components/Toast';

const mockIssues = [
  {
    issue_id: '1',
    org_id: 'stellar-org',
    title: 'Fix onboarding flow',
    status: 'open' as const,
    reward_xlm: 10,
    created_at: '2024-01-01',
  },
  {
    issue_id: '2',
    org_id: 'stellar-org',
    title: 'Add analytics dashboard',
    status: 'open' as const,
    reward_xlm: 20,
    created_at: '2024-01-02',
  },
  {
    issue_id: '3',
    org_id: 'stellar-org',
    title: 'Improve docs',
    status: 'open' as const,
    reward_xlm: 30,
    created_at: '2024-01-03',
  },
];

vi.mock('../../hooks/useWallet', () => ({
  useWallet: () => ({
    publicKey: 'GABC',
    error: null,
    networkMismatch: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('../../hooks/useInfiniteOrgIssues', () => ({
  useInfiniteOrgIssues: () => ({
    issues: mockIssues,
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
    error: null,
    globalAppCount: 0,
    orgAssignCount: 0,
    refresh: vi.fn(),
    setIssueStatus: vi.fn(),
  }),
}));

describe('OrgIssuesPage filters', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/orgs/stellar-org/issues');
  });

  it('filters by search text', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orgs/stellar-org/issues']}>
          <Routes>
            <Route path="/orgs/:org_id/issues" element={<OrgIssuesPage apiBase="/api" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    const searchInput = screen.getByPlaceholderText(/search issues/i);
    fireEvent.change(searchInput, { target: { value: 'analytics' } });

    await waitFor(() => {
      expect(screen.getByText('Add analytics dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Fix onboarding flow')).not.toBeInTheDocument();
    });
  });

  it('shows all issues initially', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orgs/stellar-org/issues']}>
          <Routes>
            <Route path="/orgs/:org_id/issues" element={<OrgIssuesPage apiBase="/api" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(screen.getByText('Fix onboarding flow')).toBeTruthy();
    expect(screen.getByText('Add analytics dashboard')).toBeTruthy();
    expect(screen.getByText('Improve docs')).toBeTruthy();
  });

  it('shows end-of-list message when no more issues', () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orgs/stellar-org/issues']}>
          <Routes>
            <Route path="/orgs/:org_id/issues" element={<OrgIssuesPage apiBase="/api" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );

    expect(screen.getByText(/all issues loaded/i)).toBeTruthy();
  });
});
