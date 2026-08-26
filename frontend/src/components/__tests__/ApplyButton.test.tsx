/**
 * Tests for useApplyForIssue hook and ApplyButton component — Issue #5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { ApplyButton } from "../ApplyButton";
import {
  useApplyForIssue,
  CONTRACT_ERROR_MESSAGES,
} from "../../hooks/useApplyForIssue";

// ---------------------------------------------------------------------------
// Hook tests
// ---------------------------------------------------------------------------

describe("useApplyForIssue", () => {
  const baseOpts = {
    contributor: "GBXXX1",
    orgId: "stellar-org",
    issueId: 42,
  };

  it("starts in idle state", () => {
    const client = { apply_for_issue: vi.fn() };
    const { result } = renderHook(() =>
      useApplyForIssue({ ...baseOpts, contractClient: client })
    );
    expect(result.current.state).toBe("idle");
    expect(result.current.errorMessage).toBeNull();
  });

  it("transitions to applied on success", async () => {
    const client = { apply_for_issue: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() =>
      useApplyForIssue({ ...baseOpts, contractClient: client })
    );

    await act(() => result.current.apply());

    expect(result.current.state).toBe("applied");
    expect(result.current.errorMessage).toBeNull();
    expect(client.apply_for_issue).toHaveBeenCalledWith(
      baseOpts.contributor,
      baseOpts.orgId,
      baseOpts.issueId
    );
  });

  it("transitions to error on failure with raw message", async () => {
    const client = {
      apply_for_issue: vi.fn().mockRejectedValue(new Error("RPC timeout")),
    };
    const { result } = renderHook(() =>
      useApplyForIssue({ ...baseOpts, contractClient: client })
    );

    await act(() => result.current.apply());

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toBe("RPC timeout");
  });

  it.each([
    [6, "You have reached the global limit of 15 pending applications"],
    [8, "You have already applied for this issue"],
    [5, "Contributor authorisation failed"],
    [7, "You have reached the limit of 4 active assignments"],
  ])("maps contract error code %i to friendly message", async (code, expectedSubstring) => {
    const client = {
      apply_for_issue: vi.fn().mockRejectedValue(
        new Error(`Soroban error code=${code}`)
      ),
    };
    const { result } = renderHook(() =>
      useApplyForIssue({ ...baseOpts, contractClient: client })
    );

    await act(() => result.current.apply());

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toContain(expectedSubstring);
  });

  it("maps user cancellation to friendly message", async () => {
    const client = {
      apply_for_issue: vi.fn().mockRejectedValue(new Error("User rejected the request")),
    };
    const { result } = renderHook(() =>
      useApplyForIssue({ ...baseOpts, contractClient: client })
    );

    await act(() => result.current.apply());

    expect(result.current.errorMessage).toBe("Transaction was cancelled.");
  });

  it("reset returns to idle state", async () => {
    const client = {
      apply_for_issue: vi.fn().mockRejectedValue(new Error("fail")),
    };
    const { result } = renderHook(() =>
      useApplyForIssue({ ...baseOpts, contractClient: client })
    );

    await act(() => result.current.apply());
    expect(result.current.state).toBe("error");

    act(() => result.current.reset());
    expect(result.current.state).toBe("idle");
    expect(result.current.errorMessage).toBeNull();
  });

  it("returns error when no client is available", async () => {
    // @ts-expect-error remove global client
    delete globalThis.__contract_client__;

    const { result } = renderHook(() =>
      useApplyForIssue(baseOpts) // no contractClient prop
    );

    await act(() => result.current.apply());

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toMatch(/contract client not available/i);
  });

  it("exports all 11 CONTRACT_ERROR_MESSAGES", () => {
    const codes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17];
    for (const code of codes) {
      expect(CONTRACT_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// ApplyButton component tests
// ---------------------------------------------------------------------------

describe("ApplyButton", () => {
  const CONTRIBUTOR = "GBXXX1ABCDEFGHIJKLMNO12345678901234567890";

  it("renders Apply button in idle state", () => {
    const client = { apply_for_issue: vi.fn() };
    render(
      <ApplyButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );
    expect(screen.getByTestId("apply-btn")).toBeInTheDocument();
    expect(screen.getByTestId("apply-btn")).not.toBeDisabled();
  });

  it("shows spinner and disabled state while submitting", async () => {
    const client = {
      apply_for_issue: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    render(
      <ApplyButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );

    await userEvent.click(screen.getByTestId("apply-btn"));

    expect(screen.getByText(/Applying/i)).toBeInTheDocument();
    expect(screen.getByTestId("apply-btn")).toBeDisabled();
  });

  it("shows Withdraw button after successful apply", async () => {
    const client = {
      apply_for_issue: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <ApplyButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );

    await userEvent.click(screen.getByTestId("apply-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("withdraw-btn")).toBeInTheDocument()
    );
  });

  it("calls onWithdraw when Withdraw is clicked after apply", async () => {
    const onWithdraw = vi.fn();
    const client = {
      apply_for_issue: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <ApplyButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
        onWithdraw={onWithdraw}
      />
    );

    await userEvent.click(screen.getByTestId("apply-btn"));
    await waitFor(() => screen.getByTestId("withdraw-btn"));
    await userEvent.click(screen.getByTestId("withdraw-btn"));

    expect(onWithdraw).toHaveBeenCalledOnce();
  });

  it("shows error message on contract failure", async () => {
    const client = {
      apply_for_issue: vi.fn().mockRejectedValue(
        new Error("error code=8: duplicate application")
      ),
    };
    render(
      <ApplyButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );

    await userEvent.click(screen.getByTestId("apply-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("apply-error")).toBeInTheDocument()
    );
    expect(screen.getByTestId("apply-error")).toHaveTextContent(
      /already applied/i
    );
  });

  it("disables button and shows tooltip when applyDisabledReason is set", () => {
    const client = { apply_for_issue: vi.fn() };
    render(
      <ApplyButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
        applyDisabledReason="Global limit reached"
      />
    );

    expect(screen.getByTestId("apply-btn")).toBeDisabled();
  });
});
