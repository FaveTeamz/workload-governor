import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IssueDetailPage } from './IssueDetailPage';
import type { IssueDetailData } from '../hooks/useIssueDetail';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ISSUE: IssueDetailData = {
  issue: {
    id: 42,
    org_id: 'stellar-org',
    title: 'Fix TTL extension bug',
    body: '## Overview\n\nThis is a **critical** bug affecting all users.',
    labels: 'bug,good-first-issue',
    github_url: 'https://github.com/stellar/repo/issues/42',
    status: 'open',
    created_at: '2026-06-01T10:00:00Z',
  },
  applicant_count: 3,
  assigned_to: null,
  events: [
    {
      id: 1,
      event_type: 'applied',
      contributor: 'GABC1234WXYZ',
      actor: 'GABC1234WXYZ',
      timestamp: '2026-06-02T08:00:00Z',
      tx_hash: 'deadbeef123456',
    },
    {
      id: 2,
      event_type: 'assigned',
      contributor: 'GABC1234WXYZ',
      actor: 'GMAINT5678',
      timestamp: '2026-06-03T09:00:00Z',
      tx_hash: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock wallet — connected by default */
let mockPublicKey: string | null = 'GTEST_WALLET_ADDRESS';
vi.mock('../hooks/useWallet', () => ({
  useWallet: () => ({
    publicKey: mockPublicKey,
    error: null,
    connecting: false,
    networkMismatch: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

function mockFetch(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Renders IssueDetailPage inside a MemoryRouter at the target route */
function renderPage(
  orgId = 'stellar-org',
  issueId = '42',
  props: Partial<React.ComponentProps<typeof IssueDetailPage>> = {},
) {
  return render(
    <MemoryRouter initialEntries={[`/issues/${orgId}/${issueId}`]}>
      <Routes>
        <Route path="/issues/:org_id/:issue_id" element={<IssueDetailPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueDetailPage', () => {
  beforeEach(() => {
    mockPublicKey = 'GTEST_WALLET_ADDRESS';
    // Clipboard API stub (needed by CopyButton)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true, configurable: true,
    });
    mockFetch(MOCK_ISSUE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while fetching', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading issue/i)).toBeTruthy();
  });

  // ── Success state ──────────────────────────────────────────────────────────

  it('renders the issue title after loading', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: /Fix TTL extension bug/i }));
  });

  it('renders the org_id in the breadcrumb', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('stellar-org').length).toBeGreaterThan(0));
  });

  it('renders the issue status badge', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('open').length).toBeGreaterThan(0));
  });

  it('renders labels as badges', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('bug')).toBeTruthy();
      expect(screen.getByText('good-first-issue')).toBeTruthy();
    });
  });

  it('renders the applicant count', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/3 applicants/i)).toBeTruthy());
  });

  it('renders Markdown body as HTML (h2 heading)', async () => {
    renderPage();
    await waitFor(() => {
      const heading = screen.getByRole('heading', { name: /overview/i, level: 2 });
      expect(heading).toBeTruthy();
    });
  });

  it('renders bold text from Markdown', async () => {
    renderPage();
    await waitFor(() => {
      const strong = document.querySelector('.markdown-body strong');
      expect(strong?.textContent).toBe('critical');
    });
  });

  it('renders the GitHub link in the sidebar', async () => {
    renderPage();
    await waitFor(() => {
      // aria-label is "View issue on GitHub: <title>"
      const link = screen.getByRole('link', { name: /view issue on github/i });
      expect(link.getAttribute('href')).toBe('https://github.com/stellar/repo/issues/42');
    });
  });

  // ── Timeline ──────────────────────────────────────────────────────────────

  it('renders timeline events with correct labels', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Applied')).toBeTruthy();
      expect(screen.getByText('Assigned')).toBeTruthy();
    });
  });

  it('renders truncated tx hash for events that have one', async () => {
    renderPage();
    await waitFor(() => {
      // First event has tx_hash 'deadbeef123456' → truncated to 'deadbeef1234…'
      expect(screen.getByText(/deadbeef1234/)).toBeTruthy();
    });
  });

  it('renders a copy button for tx hash', async () => {
    renderPage();
    await waitFor(() => {
      const copyBtns = screen.getAllByRole('button', { name: /copy transaction hash/i });
      expect(copyBtns.length).toBeGreaterThan(0);
    });
  });

  // ── Apply / Withdraw sidebar ───────────────────────────────────────────────

  it('shows Apply button when wallet is connected and not yet applied', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply for this issue/i })).toBeTruthy();
    });
  });

  it('shows Withdraw button when contributor has already applied', async () => {
    // The mock data has 'applied' event with contributor = 'GABC1234WXYZ'
    mockPublicKey = 'GABC1234WXYZ';
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /withdraw your application/i })).toBeTruthy();
    });
  });

  it('Apply button is absent when wallet is not connected', async () => {
    mockPublicKey = null;
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: /Fix TTL extension bug/i }));
    expect(screen.queryByRole('button', { name: /apply for this issue/i })).toBeNull();
    expect(screen.getByText(/connect your wallet/i)).toBeTruthy();
  });

  it('calls onApply with org_id and issue_id when Apply is clicked', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderPage('stellar-org', '42', { onApply });
    await waitFor(() => screen.getByRole('button', { name: /apply for this issue/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply for this issue/i }));
    });
    expect(onApply).toHaveBeenCalledWith('stellar-org', '42');
  });

  it('calls onWithdraw with org_id and issue_id when Withdraw is clicked', async () => {
    mockPublicKey = 'GABC1234WXYZ';
    const onWithdraw = vi.fn().mockResolvedValue(undefined);
    renderPage('stellar-org', '42', { onWithdraw });
    await waitFor(() => screen.getByRole('button', { name: /withdraw your application/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /withdraw your application/i }));
    });
    expect(onWithdraw).toHaveBeenCalledWith('stellar-org', '42');
  });

  it('shows action error message when onApply rejects', async () => {
    const onApply = vi.fn().mockRejectedValue(new Error('Global cap reached'));
    renderPage('stellar-org', '42', { onApply });
    await waitFor(() => screen.getByRole('button', { name: /apply for this issue/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply for this issue/i }));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('Global cap reached');
  });

  it('shows "already assigned" message when issue is assigned to someone else', async () => {
    const assigned: IssueDetailData = {
      ...MOCK_ISSUE,
      issue: { ...MOCK_ISSUE.issue, status: 'assigned' },
      assigned_to: 'GOTHER_CONTRIBUTOR',
    };
    mockFetch(assigned);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/this issue has already been assigned/i)).toBeTruthy(),
    );
  });

  // ── Share link ─────────────────────────────────────────────────────────────

  it('renders the share URL input', async () => {
    renderPage();
    await waitFor(() => {
      const input = screen.getByRole('textbox', { name: /issue url/i });
      expect(input).toBeTruthy();
    });
  });

  it('renders a copy URL button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy issue url/i })).toBeTruthy();
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message on fetch failure', async () => {
    mockFetch({ error: 'Issue not found' }, 404);
    renderPage();
    await waitFor(() => expect(screen.getByText(/issue not found/i)).toBeTruthy());
  });

  it('shows a Retry button on error', async () => {
    mockFetch({ error: 'Issue not found' }, 404);
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy());
  });
});
