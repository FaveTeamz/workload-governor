/**
 * ContributorProfilePage.test.tsx
 *
 * Covers all acceptance criteria:
 *  AC-1  Profile loads with correct cap data
 *  AC-2  Own-profile shows withdraw buttons
 *  AC-3  Share button copies URL
 *  AC-4  404 shown for unknown address
 *  AC-5  Responsive layout classes present on mobile (smoke)
 *
 * Additionally covers:
 *  - Loading skeleton
 *  - Server error state
 *  - Per-org counts rendered
 *  - Recent 10 events rendered (not more)
 *  - Withdraw removes item from list
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContributorProfilePage } from '../pages/ContributorProfilePage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADDR   = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRS'; // 52 chars valid Stellar
const OTHER  = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'; // different address

const MOCK_PROFILE = {
  address: ADDR,
  global_application_count: 3,
  global_assignment_count: 2,
  orgs: [
    { org_id: 'stellar-org', applications: 2, assignments: 1 },
    { org_id: 'meridian-dao', applications: 1, assignments: 1 },
  ],
  recent_events: Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    event_type: i % 2 === 0 ? 'applied' : 'assigned',
    org_id: 'stellar-org',
    issue_id: 100 + i,
    tx_hash: `txhash${String(i + 1).padStart(10, '0')}`,
    ledger: 1000 + i,
    timestamp: new Date(Date.now() - i * 60_000).toISOString(),
  })),
};

const MOCK_APPLICATIONS = [
  { org_id: 'stellar-org',  issue_id: 42, title: 'Fix TTL bug',      created_at: '2026-07-01' },
  { org_id: 'meridian-dao', issue_id: 77, title: 'Docs improvement', created_at: '2026-07-02' },
];

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type FetchHandler = (url: string, opts?: RequestInit) => Promise<Response>;

function mockFetch(handler: FetchHandler) {
  vi.stubGlobal('fetch', vi.fn(handler));
}

function makeOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function make404Response(): Response {
  return new Response(JSON.stringify({ error: 'contributor not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

function make500Response(): Response {
  return new Response(JSON.stringify({ error: 'internal server error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Set wallet public key in localStorage (same key used by useWallet). */
function setWallet(publicKey: string | null) {
  if (publicKey) {
    localStorage.setItem('wg_wallet_pubkey', publicKey);
  } else {
    localStorage.removeItem('wg_wallet_pubkey');
  }
}

/** Render the page inside MemoryRouter pointing to /contributor/:address */
function renderPage(address: string = ADDR) {
  return render(
    <MemoryRouter initialEntries={[`/contributor/${address}`]}>
      <Routes>
        <Route path="/contributor/:address" element={<ContributorProfilePage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();

  // Default clipboard mock
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// ===========================================================================
// AC-1: Profile loads with correct cap data
// ===========================================================================

describe('AC-1: profile loads with correct cap data', () => {
  it('renders heading and address after data loads', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Contributor Profile/i })).toBeInTheDocument();
    });
  });

  it('renders global cap gauge with correct value and max', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    // Gauge renders as svg with aria-label containing the counts
    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: /Applications: 3 of 15/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders per-org breakdown', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    await waitFor(() => {
      // Use getAllByText because org names also appear in the event list
      expect(screen.getAllByText('stellar-org').length).toBeGreaterThan(0);
      expect(screen.getAllByText('meridian-dao').length).toBeGreaterThan(0);
    });
  });

  it('shows at most 10 events even when API returns more', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE); // 12 events in fixture
    });

    renderPage();

    await waitFor(() => screen.getByText('Recent activity'));

    // Each event is a listitem
    const eventItems = screen.getAllByRole('listitem').filter(li =>
      li.className.includes('cpp-event')
    );
    expect(eventItems.length).toBe(10);
  });

  it('renders assignment progress bar with correct aria attributes', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    await waitFor(() => {
      // Both orgs have 1 assignment; use getAllByRole since multiple match
      const bars = screen.getAllByRole('progressbar', {
        name: /Assignments: 1 of 4/i,
      });
      expect(bars.length).toBeGreaterThanOrEqual(1);
      expect(bars[0]).toHaveAttribute('aria-valuenow', '1');
      expect(bars[0]).toHaveAttribute('aria-valuemax', '4');
    });
  });

  it('shows skeleton while loading', () => {
    // Fetch never resolves so we stay in loading state
    mockFetch(() => new Promise(() => undefined));
    renderPage();
    expect(screen.getByLabelText('Loading profile…')).toBeInTheDocument();
  });
});

// ===========================================================================
// AC-2: Own-profile shows withdraw buttons
// ===========================================================================

describe('AC-2: own-profile shows withdraw buttons', () => {
  it('shows withdraw buttons when wallet matches the profile address', async () => {
    setWallet(ADDR);

    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse(MOCK_APPLICATIONS);
      return makeOkResponse({ ...MOCK_PROFILE, address: ADDR });
    });

    renderPage(ADDR);

    await waitFor(() => {
      expect(screen.getByText('Your applications')).toBeInTheDocument();
    });

    // Applications load asynchronously — wait for the buttons
    const withdrawBtns = await screen.findAllByRole('button', { name: /Withdraw application/i });
    expect(withdrawBtns.length).toBe(MOCK_APPLICATIONS.length);
  });

  it('shows "You" badge on own profile', async () => {
    setWallet(ADDR);

    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse(MOCK_APPLICATIONS);
      return makeOkResponse({ ...MOCK_PROFILE, address: ADDR });
    });

    renderPage(ADDR);

    await waitFor(() => {
      expect(screen.getByLabelText(/This is your profile/i)).toBeInTheDocument();
    });
  });

  it('does NOT show withdraw section when viewing another profile', async () => {
    setWallet(OTHER);

    mockFetch(async () => makeOkResponse(MOCK_PROFILE));

    renderPage(ADDR);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Contributor Profile/i })).toBeInTheDocument();
    });

    expect(screen.queryByText('Your applications')).not.toBeInTheDocument();
  });

  it('does NOT show withdraw section when wallet is disconnected', async () => {
    setWallet(null);

    mockFetch(async () => makeOkResponse(MOCK_PROFILE));

    renderPage(ADDR);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Contributor Profile/i })).toBeInTheDocument();
    });

    expect(screen.queryByText('Your applications')).not.toBeInTheDocument();
  });

  it('removes application from list after successful withdraw', async () => {
    setWallet(ADDR);

    const deletedIds: number[] = [];

    mockFetch(async (url, opts) => {
      if (url.includes('/applications') && opts?.method === 'DELETE') {
        const parts = url.split('/');
        deletedIds.push(Number(parts[parts.length - 1]));
        return new Response(null, { status: 204 });
      }
      if (url.includes('/applications')) {
        return makeOkResponse(MOCK_APPLICATIONS);
      }
      return makeOkResponse({ ...MOCK_PROFILE, address: ADDR });
    });

    renderPage(ADDR);

    await waitFor(() =>
      expect(screen.getByRole('button', {
        name: /Withdraw application for issue 42/i,
      })).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole('button', { name: /Withdraw application for issue 42/i }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', {
        name: /Withdraw application for issue 42/i,
      })).not.toBeInTheDocument();
    });
  });
});

// ===========================================================================
// AC-3: Share button copies URL
// ===========================================================================

describe('AC-3: share button copies profile URL', () => {
  it('calls navigator.clipboard.writeText with the current URL', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Copy profile URL/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: /Copy profile URL/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(window.location.href.split('?')[0]),
    );
  });

  it('shows "Copied!" text after clicking share', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    await waitFor(() =>
      screen.getByRole('button', { name: /Copy profile URL/i }),
    );

    await userEvent.click(screen.getByRole('button', { name: /Copy profile URL/i }));

    await waitFor(() => {
      expect(screen.getByText(/Copied!/i)).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// AC-4: 404 shown for unknown address
// ===========================================================================

describe('AC-4: 404 shown for unknown address', () => {
  it('renders not-found error state when API returns 404', async () => {
    mockFetch(async () => make404Response());

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: /Contributor not found/i })).toBeInTheDocument();
    });
  });

  it('renders 404 copy about no on-chain activity', async () => {
    mockFetch(async () => make404Response());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no on-chain activity/i)).toBeInTheDocument();
    });
  });

  it('renders server error state when API returns 500', async () => {
    mockFetch(async () => make500Response());

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('alert', { name: /Something went wrong/i }),
      ).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// AC-5: Responsive layout smoke
// ===========================================================================

describe('AC-5: responsive layout — CSS class names present', () => {
  it('renders page with .cpp class on <main>', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    await waitFor(() => {
      const main = document.getElementById('main-content');
      expect(main).not.toBeNull();
      expect(main!.classList.contains('cpp')).toBe(true);
    });
  });

  it('gauge section has cpp-gauge-section class', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(MOCK_PROFILE);
    });

    renderPage();

    await waitFor(() => {
      const section = document.querySelector('.cpp-gauge-section');
      expect(section).not.toBeNull();
    });
  });
});

// ===========================================================================
// Warning banner
// ===========================================================================

describe('Warning banner at cap threshold', () => {
  it('shows warning when global_application_count >= 12', async () => {
    const nearCapProfile = { ...MOCK_PROFILE, global_application_count: 12 };
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse(nearCapProfile);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Approaching global application cap/i)).toBeInTheDocument();
    });
  });

  it('does not show warning below threshold', async () => {
    mockFetch(async (url) => {
      if (url.includes('/applications')) return makeOkResponse([]);
      return makeOkResponse({ ...MOCK_PROFILE, global_application_count: 5 });
    });

    renderPage();

    await waitFor(() =>
      screen.getByRole('img', { name: /Applications: 5 of 15/i }),
    );

    expect(screen.queryByText(/Approaching global application cap/i)).not.toBeInTheDocument();
  });
});
