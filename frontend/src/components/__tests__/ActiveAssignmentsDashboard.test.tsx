/**
 * Tests for ActiveAssignmentsDashboard — Issue #7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveAssignmentsDashboard } from "../ActiveAssignmentsDashboard";

// ---------------------------------------------------------------------------
// Mock contract client
// ---------------------------------------------------------------------------

const mockClient = {
  list_orgs: vi.fn<() => Promise<string[]>>(),
  get_org_assignment_count: vi.fn<(c: string, o: string) => Promise<number>>(),
  list_org_assignments: vi.fn<(c: string, o: string) => Promise<Array<{ issue_id: string; date?: string }>>>(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // @ts-expect-error global mock
  globalThis.__contract_client__ = mockClient;
});

afterEach(() => {
  // @ts-expect-error global mock
  delete globalThis.__contract_client__;
});

const CONTRIBUTOR = "GBXXX1ABCDEFGHIJKLMNO12345678901234567890";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ActiveAssignmentsDashboard", () => {
  it("shows connect wallet prompt when no contributor", () => {
    render(<ActiveAssignmentsDashboard contributor={null} />);
    expect(screen.getAllByText(/no active assignments/i).length).toBeGreaterThan(0);
  });

  it("shows loading skeleton while fetching", async () => {
    // Never resolves
    mockClient.list_orgs.mockReturnValue(new Promise(() => {}));

    render(<ActiveAssignmentsDashboard contributor={CONTRIBUTOR} />);
    // aria-busy should be true during loading
    const section = await screen.findByRole("region", { hidden: true });
    expect(section.getAttribute("aria-busy")).toBe("true");
  });

  it("shows empty state when contributor has no active assignments", async () => {
    mockClient.list_orgs.mockResolvedValue(["stellar-org"]);
    mockClient.get_org_assignment_count.mockResolvedValue(0);
    mockClient.list_org_assignments.mockResolvedValue([]);

    render(<ActiveAssignmentsDashboard contributor={CONTRIBUTOR} />);

    await waitFor(() =>
      expect(screen.getAllByText(/no active assignments/i).length).toBeGreaterThan(0)
    );
    // No dashboard should be rendered (empty state, not the loaded view)
    expect(screen.queryByTestId("active-assignments-dashboard")).not.toBeInTheDocument();
  });

  it("renders org sections with assignments when data is present", async () => {
    mockClient.list_orgs.mockResolvedValue(["stellar-org", "meridian-dao"]);
    mockClient.get_org_assignment_count.mockImplementation(
      async (_c, org) => (org === "stellar-org" ? 2 : 1)
    );
    mockClient.list_org_assignments.mockImplementation(async (_c, org) =>
      org === "stellar-org"
        ? [
            { issue_id: "42", date: "2026-06-01" },
            { issue_id: "99", date: "2026-06-10" },
          ]
        : [{ issue_id: "7", date: "2026-06-20" }]
    );

    render(<ActiveAssignmentsDashboard contributor={CONTRIBUTOR} />);

    await waitFor(() =>
      expect(screen.getByTestId("active-assignments-dashboard")).toBeInTheDocument()
    );

    expect(screen.getAllByText("stellar-org").length).toBeGreaterThan(0);
    expect(screen.getAllByText("meridian-dao").length).toBeGreaterThan(0);
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("#99")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
  });

  it("renders progress bars reflecting 0–4 capacity per org", async () => {
    mockClient.list_orgs.mockResolvedValue(["stellar-org"]);
    mockClient.get_org_assignment_count.mockResolvedValue(3);
    mockClient.list_org_assignments.mockResolvedValue([
      { issue_id: "1", date: "2026-01-01" },
      { issue_id: "2", date: "2026-01-02" },
      { issue_id: "3", date: "2026-01-03" },
    ]);

    render(<ActiveAssignmentsDashboard contributor={CONTRIBUTOR} />);

    await waitFor(() =>
      expect(screen.getByTestId("active-assignments-dashboard")).toBeInTheDocument()
    );

    const progressbar = screen.getByRole("progressbar", { name: /stellar-org capacity/i });
    expect(progressbar).toHaveAttribute("aria-valuenow", "3");
    expect(progressbar).toHaveAttribute("aria-valuemax", "4");
  });

  it("shows error state and retry button when fetch fails", async () => {
    mockClient.list_orgs.mockRejectedValue(new Error("RPC unreachable"));

    render(<ActiveAssignmentsDashboard contributor={CONTRIBUTOR} />);

    await waitFor(() =>
      expect(screen.getByText(/RPC unreachable/i)).toBeInTheDocument()
    );

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it("reloads data when Refresh button is clicked", async () => {
    mockClient.list_orgs.mockResolvedValue(["stellar-org"]);
    mockClient.get_org_assignment_count.mockResolvedValue(1);
    mockClient.list_org_assignments.mockResolvedValue([
      { issue_id: "10", date: "2026-01-01" },
    ]);

    render(<ActiveAssignmentsDashboard contributor={CONTRIBUTOR} />);

    await waitFor(() =>
      expect(screen.getByTestId("active-assignments-dashboard")).toBeInTheDocument()
    );

    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    await userEvent.click(refreshBtn);

    // list_orgs should have been called twice (initial + refresh)
    await waitFor(() =>
      expect(mockClient.list_orgs).toHaveBeenCalledTimes(2)
    );
  });

  it("filters out orgs with 0 assignments from the list", async () => {
    mockClient.list_orgs.mockResolvedValue(["stellar-org", "empty-org"]);
    mockClient.get_org_assignment_count.mockImplementation(
      async (_c, org) => (org === "empty-org" ? 0 : 1)
    );
    mockClient.list_org_assignments.mockImplementation(async (_c, org) =>
      org === "empty-org" ? [] : [{ issue_id: "5", date: "2026-01-01" }]
    );

    render(<ActiveAssignmentsDashboard contributor={CONTRIBUTOR} />);

    await waitFor(() =>
      expect(screen.getByTestId("active-assignments-dashboard")).toBeInTheDocument()
    );

    expect(screen.getAllByText("stellar-org").length).toBeGreaterThan(0);
    expect(screen.queryByText("empty-org")).not.toBeInTheDocument();
  });
});
