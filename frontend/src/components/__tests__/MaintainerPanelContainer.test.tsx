/**
 * Tests for useMaintainerPanel and MaintainerPanelContainer — Issue #8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { MaintainerPanelContainer } from "../MaintainerPanelContainer";
import { useMaintainerPanel } from "../../hooks/useMaintainerPanel";

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function makeMockClient(overrides?: Partial<{
  is_maintainer: (m: string, o: string) => Promise<boolean>;
  list_applications: (o: string) => Promise<unknown[]>;
  list_assignments: (o: string) => Promise<unknown[]>;
  assign_issue: () => Promise<void>;
  complete_assignment: () => Promise<void>;
  revoke_assignment: () => Promise<void>;
}>) {
  return {
    is_maintainer: vi.fn().mockResolvedValue(true),
    list_applications: vi.fn().mockResolvedValue([]),
    list_assignments: vi.fn().mockResolvedValue([]),
    assign_issue: vi.fn().mockResolvedValue(undefined),
    complete_assignment: vi.fn().mockResolvedValue(undefined),
    revoke_assignment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const MAINTAINER = "GMAINT1ABCDEFGHIJKLMNO12345678901234567890";

// ---------------------------------------------------------------------------
// useMaintainerPanel hook tests
// ---------------------------------------------------------------------------

describe("useMaintainerPanel", () => {
  it("starts loading and resolves to authorized for a maintainer", async () => {
    const client = makeMockClient();
    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: MAINTAINER,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    expect(result.current.status).toBe("loading");

    await waitFor(() =>
      expect(result.current.status).toBe("authorized")
    );
  });

  it("resolves to forbidden for a non-maintainer", async () => {
    const client = makeMockClient({
      is_maintainer: vi.fn().mockResolvedValue(false),
    });
    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: MAINTAINER,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    await waitFor(() =>
      expect(result.current.status).toBe("forbidden")
    );
  });

  it("resolves to no-wallet when no address provided", async () => {
    const client = makeMockClient();
    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: null,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    await waitFor(() =>
      expect(result.current.status).toBe("no-wallet")
    );
  });

  it("loads applications and assignments after authorization", async () => {
    const client = makeMockClient({
      list_applications: vi.fn().mockResolvedValue([
        {
          contributor: "GBCONTR1",
          issue_id: "10",
          date: "2026-01-01",
          global_count: 2,
          org_count: 1,
        },
      ]),
      list_assignments: vi.fn().mockResolvedValue([
        { contributor: "GBCONTR2", issue_id: "20" },
      ]),
    });

    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: MAINTAINER,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("authorized"));
    await waitFor(() => expect(result.current.applications).toHaveLength(1));

    expect(result.current.applications[0].issueTitle).toBe("Issue #10");
    expect(result.current.assignments[0].issueTitle).toBe("Issue #20");
  });

  it("optimistically removes application on handleAssign success", async () => {
    const client = makeMockClient({
      list_applications: vi.fn().mockResolvedValue([
        { contributor: "GBCONTR1", issue_id: "10", date: "2026-01-01" },
      ]),
    });

    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: MAINTAINER,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    await waitFor(() => expect(result.current.applications).toHaveLength(1));

    const app = result.current.applications[0];
    await act(() => result.current.handleAssign(app));

    expect(result.current.applications).toHaveLength(0);
    expect(result.current.assignments).toHaveLength(1);
  });

  it("rolls back application on handleAssign failure", async () => {
    const client = makeMockClient({
      list_applications: vi.fn().mockResolvedValue([
        { contributor: "GBCONTR1", issue_id: "10", date: "2026-01-01" },
      ]),
      assign_issue: vi.fn().mockRejectedValue(new Error("Contract error")),
    });

    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: MAINTAINER,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    await waitFor(() => expect(result.current.applications).toHaveLength(1));

    const app = result.current.applications[0];
    await expect(act(() => result.current.handleAssign(app))).rejects.toThrow();

    // Application should be rolled back
    expect(result.current.applications).toHaveLength(1);
    expect(result.current.assignments).toHaveLength(0);
  });

  it("optimistically removes assignment on handleComplete", async () => {
    const client = makeMockClient({
      list_assignments: vi.fn().mockResolvedValue([
        { contributor: "GBCONTR1", issue_id: "10" },
      ]),
    });

    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: MAINTAINER,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    await waitFor(() => expect(result.current.assignments).toHaveLength(1));

    const asgn = result.current.assignments[0];
    await act(() => result.current.handleComplete(asgn));

    expect(result.current.assignments).toHaveLength(0);
  });

  it("optimistically removes assignment on handleRevoke", async () => {
    const client = makeMockClient({
      list_assignments: vi.fn().mockResolvedValue([
        { contributor: "GBCONTR1", issue_id: "10" },
      ]),
    });

    const { result } = renderHook(() =>
      useMaintainerPanel({
        maintainerAddress: MAINTAINER,
        orgIds: ["stellar-org"],
        contractClient: client as any,
      })
    );

    await waitFor(() => expect(result.current.assignments).toHaveLength(1));

    const asgn = result.current.assignments[0];
    await act(() => result.current.handleRevoke(asgn));

    expect(result.current.assignments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MaintainerPanelContainer component tests
// ---------------------------------------------------------------------------

describe("MaintainerPanelContainer", () => {
  it("renders nothing when wallet is not connected", async () => {
    const client = makeMockClient();
    const { container } = render(
      <MaintainerPanelContainer
        maintainerAddress={null}
        orgIds={["stellar-org"]}
        contractClient={client as any}
      />
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing for a non-maintainer", async () => {
    const client = makeMockClient({
      is_maintainer: vi.fn().mockResolvedValue(false),
    });
    const { container } = render(
      <MaintainerPanelContainer
        maintainerAddress={MAINTAINER}
        orgIds={["stellar-org"]}
        contractClient={client as any}
      />
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders the panel for an authorized maintainer", async () => {
    const client = makeMockClient();
    render(
      <MaintainerPanelContainer
        maintainerAddress={MAINTAINER}
        orgIds={["stellar-org"]}
        contractClient={client as any}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("maintainer-panel-container")).toBeInTheDocument()
    );
    // The MaintainerPanel heading
    expect(screen.getByText(/maintainer panel/i)).toBeInTheDocument();
  });

  it("shows loading indicator while checking role", () => {
    // Never resolves
    const client = makeMockClient({
      is_maintainer: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(
      <MaintainerPanelContainer
        maintainerAddress={MAINTAINER}
        orgIds={["stellar-org"]}
        contractClient={client as any}
      />
    );

    expect(screen.getByTestId("maintainer-panel-loading")).toBeInTheDocument();
  });
});
