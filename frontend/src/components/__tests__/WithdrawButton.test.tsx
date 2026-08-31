/**
 * Tests for WithdrawButton and useWithdrawApplication — Issue #6
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { WithdrawButton } from "../WithdrawButton";
import { useWithdrawApplication } from "../../hooks/useWithdrawApplication";

// ---------------------------------------------------------------------------
// useWithdrawApplication hook tests
// ---------------------------------------------------------------------------

describe("useWithdrawApplication", () => {
  const baseOpts = {
    contributor: "GBXXX1",
    orgId: "stellar-org",
    issueId: 42,
  };

  it("starts in idle state", () => {
    const client = { withdraw_application: vi.fn() };
    const { result } = renderHook(() =>
      useWithdrawApplication({ ...baseOpts, contractClient: client })
    );
    expect(result.current.state).toBe("idle");
  });

  it("moves to confirming state on requestWithdraw", () => {
    const client = { withdraw_application: vi.fn() };
    const { result } = renderHook(() =>
      useWithdrawApplication({ ...baseOpts, contractClient: client })
    );

    act(() => result.current.requestWithdraw());
    expect(result.current.state).toBe("confirming");
  });

  it("returns to idle on cancelWithdraw", () => {
    const client = { withdraw_application: vi.fn() };
    const { result } = renderHook(() =>
      useWithdrawApplication({ ...baseOpts, contractClient: client })
    );

    act(() => result.current.requestWithdraw());
    act(() => result.current.cancelWithdraw());
    expect(result.current.state).toBe("idle");
  });

  it("transitions to withdrawn on successful confirmWithdraw", async () => {
    const onSuccess = vi.fn();
    const client = {
      withdraw_application: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() =>
      useWithdrawApplication({ ...baseOpts, contractClient: client, onSuccess })
    );

    act(() => result.current.requestWithdraw());
    await act(() => result.current.confirmWithdraw());

    expect(result.current.state).toBe("withdrawn");
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("transitions to error on failure", async () => {
    const client = {
      withdraw_application: vi.fn().mockRejectedValue(
        new Error("error code=9: application not found")
      ),
    };
    const { result } = renderHook(() =>
      useWithdrawApplication({ ...baseOpts, contractClient: client })
    );

    act(() => result.current.requestWithdraw());
    await act(() => result.current.confirmWithdraw());

    expect(result.current.state).toBe("error");
    expect(result.current.errorMessage).toMatch(/no application found/i);
  });

  it("does nothing if confirmWithdraw called outside confirming state", async () => {
    const client = {
      withdraw_application: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = renderHook(() =>
      useWithdrawApplication({ ...baseOpts, contractClient: client })
    );

    // Not in confirming state
    await act(() => result.current.confirmWithdraw());
    expect(result.current.state).toBe("idle");
    expect(client.withdraw_application).not.toHaveBeenCalled();
  });

  it("maps user cancellation to friendly message", async () => {
    const client = {
      withdraw_application: vi.fn().mockRejectedValue(
        new Error("User denied the request")
      ),
    };
    const { result } = renderHook(() =>
      useWithdrawApplication({ ...baseOpts, contractClient: client })
    );

    act(() => result.current.requestWithdraw());
    await act(() => result.current.confirmWithdraw());

    expect(result.current.errorMessage).toBe("Transaction was cancelled.");
  });
});

// ---------------------------------------------------------------------------
// WithdrawButton component tests
// ---------------------------------------------------------------------------

describe("WithdrawButton", () => {
  const CONTRIBUTOR = "GBXXX1ABCDEFGHIJKLMNO12345678901234567890";

  it("renders Withdraw trigger button", () => {
    const client = { withdraw_application: vi.fn() };
    render(
      <WithdrawButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );
    expect(screen.getByTestId("withdraw-trigger")).toBeInTheDocument();
  });

  it("opens confirmation modal when Withdraw is clicked", async () => {
    const client = { withdraw_application: vi.fn() };
    render(
      <WithdrawButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        issueTitle="Fix the bug"
        contractClient={client}
      />
    );

    await userEvent.click(screen.getByTestId("withdraw-trigger"));

    expect(screen.getByRole("dialog", { name: /confirm withdrawal/i })).toBeInTheDocument();
    expect(screen.getByText(/Fix the bug/i)).toBeInTheDocument();
  });

  it("closes modal when Cancel is clicked without submitting", async () => {
    const client = { withdraw_application: vi.fn() };
    render(
      <WithdrawButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );

    await userEvent.click(screen.getByTestId("withdraw-trigger"));
    await userEvent.click(screen.getByTestId("withdraw-cancel"));

    expect(
      screen.queryByRole("dialog", { name: /confirm withdrawal/i })
    ).not.toBeInTheDocument();
    expect(client.withdraw_application).not.toHaveBeenCalled();
  });

  it("submits and calls onSuccess after Confirm", async () => {
    const onSuccess = vi.fn();
    const client = {
      withdraw_application: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <WithdrawButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
        onSuccess={onSuccess}
      />
    );

    await userEvent.click(screen.getByTestId("withdraw-trigger"));
    await userEvent.click(screen.getByTestId("withdraw-confirm"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("renders nothing (withdrawn) after successful withdrawal", async () => {
    const client = {
      withdraw_application: vi.fn().mockResolvedValue(undefined),
    };
    const { container } = render(
      <WithdrawButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );

    await userEvent.click(screen.getByTestId("withdraw-trigger"));
    await userEvent.click(screen.getByTestId("withdraw-confirm"));

    await waitFor(() =>
      expect(container.firstChild).toBeNull()
    );
  });

  it("shows error message and keeps trigger visible on failure", async () => {
    const client = {
      withdraw_application: vi.fn().mockRejectedValue(
        new Error("error code=9: not found")
      ),
    };
    render(
      <WithdrawButton
        contributor={CONTRIBUTOR}
        orgId="stellar-org"
        issueId={1}
        contractClient={client}
      />
    );

    await userEvent.click(screen.getByTestId("withdraw-trigger"));
    await userEvent.click(screen.getByTestId("withdraw-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("withdraw-error")).toBeInTheDocument()
    );
    expect(screen.getByTestId("withdraw-trigger")).toBeInTheDocument();
  });
});
