import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function ToastHarness() {
  const { add } = useToast();

  return (
    <button onClick={() => add("Saved", "success", { duration: 1000 })}>
      Show toast
    </button>
  );
}

describe("Toast accessibility and timing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dismisses the focused toast with Escape", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
    const toast = screen.getByRole("status");
    expect(toast).toHaveAttribute("aria-live", "polite");
    toast.focus();
    expect(document.activeElement).toBe(toast);

    fireEvent.keyDown(toast, { key: "Escape" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps error toasts assertive and dismisses through the close button", () => {
    function ErrorHarness() {
      const { add } = useToast();
      return <button onClick={() => add("Failed", "error")}>Show error</button>;
    }

    render(
      <ToastProvider>
        <ErrorHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Show error" }));
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");

    const closeButton = screen.getByRole("button", { name: "Dismiss notification" });
    expect(closeButton).toBeVisible();
    fireEvent.click(closeButton);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pauses and resumes auto-dismiss while the toast is hovered", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
    const toast = screen.getByRole("status");
    const trigger = screen.getByRole("button", { name: "Show toast" });
    fireEvent.blur(toast, { relatedTarget: trigger });

    act(() => vi.advanceTimersByTime(500));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(499));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pauses auto-dismiss while the close button is focused and resumes after focus leaves", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
    const toast = screen.getByRole("status");
    const closeButton = screen.getByRole("button", { name: "Dismiss notification" });
    const trigger = screen.getByRole("button", { name: "Show toast" });

    trigger.focus();
    act(() => vi.advanceTimersByTime(400));
    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toBeInTheDocument();

    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    act(() => vi.advanceTimersByTime(599));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});