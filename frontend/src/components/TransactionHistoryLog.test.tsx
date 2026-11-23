/**
 * TransactionHistoryLog.test.tsx — closes #810
 *
 * Unit tests for the paginated TransactionHistoryLog component.
 *
 * Covers:
 *  - First page renders correctly
 *  - Total count displayed in heading
 *  - Previous button disabled on page 1
 *  - Next button navigates to page 2
 *  - Previous button navigates back to page 1 from page 2
 *  - Empty state when no transactions exist
 *  - Loading state shown while fetching
 *  - Error state shown on fetch failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TransactionHistoryLog } from "./TransactionHistoryLog";
import type { TransactionsResponse } from "./TransactionHistoryLog";

const MOCK_ADDRESS = "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBWE3ITMG4YOS";

function makeTx(i: number) {
  return {
    id: `tx-${i}`,
    type: "apply" as const,
    org_id: "stellar-org",
    issue_id: i + 1,
    timestamp: "2026-01-01T00:00:00Z",
    status: "success" as const,
  };
}

function makeResponse(overrides: Partial<TransactionsResponse> = {}): TransactionsResponse {
  return {
    transactions: Array.from({ length: 5 }, (_, i) => makeTx(i)),
    total: 25,
    page: 1,
    limit: 20,
    totalPages: 2,
    ...overrides,
  };
}

function mockFetch(response: TransactionsResponse) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  } as Response);
}

beforeEach(() => {
  // Reset URL search params between tests
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", "/");
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// First page renders
// ---------------------------------------------------------------------------

describe("TransactionHistoryLog — first page", () => {
  it("renders first page of transactions", async () => {
    mockFetch(makeResponse());
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("tx-log-item")).toHaveLength(5);
    });
  });

  it("shows total count in heading", async () => {
    mockFetch(makeResponse({ total: 25 }));
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      expect(screen.getByText(/25 total/i)).toBeInTheDocument();
    });
  });

  it("shows transaction type and org details", async () => {
    mockFetch(makeResponse());
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      expect(screen.getAllByText("Applied").length).toBeGreaterThan(0);
      expect(screen.getAllByText("stellar-org").length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Pagination controls
// ---------------------------------------------------------------------------

describe("TransactionHistoryLog — pagination", () => {
  it("Previous button is disabled on page 1", async () => {
    mockFetch(makeResponse());
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      const prev = screen.getByTestId("tx-log-prev");
      expect(prev).toBeDisabled();
    });
  });

  it("Next button is enabled on page 1 when there are more pages", async () => {
    mockFetch(makeResponse({ totalPages: 2 }));
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      const next = screen.getByTestId("tx-log-next");
      expect(next).not.toBeDisabled();
    });
  });

  it("clicking Next loads page 2", async () => {
    const fetchSpy = mockFetch(makeResponse());
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} pageSize={20} />);

    await waitFor(() => screen.getByTestId("tx-log-next"));
    fireEvent.click(screen.getByTestId("tx-log-next"));

    await waitFor(() => {
      // Second call should include offset=20 (page 2 with pageSize 20)
      const secondCallUrl = (fetchSpy.mock.calls[1]?.[0] as string) ?? "";
      expect(secondCallUrl).toContain("offset=20");
    });
  });

  it("Previous is disabled on page 1 and enabled on page 2", async () => {
    // Page 1 → Next → page 2: Previous should become enabled
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeResponse({ page: 1, totalPages: 2 })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeResponse({ page: 2, totalPages: 2 })),
      } as Response);

    void fetchSpy;

    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => expect(screen.getByTestId("tx-log-prev")).toBeDisabled());

    fireEvent.click(screen.getByTestId("tx-log-next"));

    await waitFor(() => {
      const prev = screen.getByTestId("tx-log-prev");
      expect(prev).not.toBeDisabled();
    });
  });

  it("clicking Previous from page 2 returns to page 1", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeResponse({ page: 1, totalPages: 2 })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeResponse({ page: 2, totalPages: 2 })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeResponse({ page: 1, totalPages: 2 })),
      } as Response);

    void fetchSpy;

    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} pageSize={20} />);

    await waitFor(() => screen.getByTestId("tx-log-next"));
    fireEvent.click(screen.getByTestId("tx-log-next"));

    await waitFor(() => screen.getByTestId("tx-log-prev"));
    fireEvent.click(screen.getByTestId("tx-log-prev"));

    await waitFor(() => {
      // Third call should have offset=0 (back to page 1)
      const thirdCallUrl = (fetchSpy.mock.calls[2]?.[0] as string) ?? "";
      expect(thirdCallUrl).toContain("offset=0");
    });
  });

  it("page indicator shows current page", async () => {
    mockFetch(makeResponse({ totalPages: 3 }));
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("TransactionHistoryLog — empty state", () => {
  it("shows empty state when no transactions exist", async () => {
    mockFetch(makeResponse({ transactions: [], total: 0, totalPages: 1 }));
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      expect(screen.getByTestId("tx-log-empty")).toBeInTheDocument();
    });
  });

  it("shows '0 total' in heading when empty", async () => {
    mockFetch(makeResponse({ transactions: [], total: 0, totalPages: 1 }));
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      expect(screen.getByText(/0 total/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Loading & error states
// ---------------------------------------------------------------------------

describe("TransactionHistoryLog — loading and error states", () => {
  it("shows loading state initially", () => {
    // Never resolves during this check
    vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows error message on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// URL query parameter
// ---------------------------------------------------------------------------

describe("TransactionHistoryLog — URL query param", () => {
  it("reflects current page in URL (?page=N) when navigating", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeResponse({ totalPages: 3 })),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeResponse({ page: 2, totalPages: 3 })),
      } as Response);

    render(<TransactionHistoryLog contributorAddress={MOCK_ADDRESS} />);

    await waitFor(() => screen.getByTestId("tx-log-next"));
    fireEvent.click(screen.getByTestId("tx-log-next"));

    await waitFor(() => {
      expect(window.location.search).toContain("page=2");
    });
  });
});
