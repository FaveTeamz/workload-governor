import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import i18n from "../i18n";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ThrowingComponent({
  shouldThrow = true,
  errorMessage = "Rendering failed",
}: {
  shouldThrow?: boolean;
  errorMessage?: string;
}) {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div data-testid="recovered-content">Recovered content</div>;
}

describe("ErrorBoundary (Issue #856 / FE-021)", () => {
  it("displays a user-friendly fallback with a 'Try Again' action and localized message", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();

    // Localized message check
    const expectedFallback = i18n.t("error.boundary_fallback", {
      defaultValue: "Something went wrong. Please try again.",
    });
    expect(screen.getByText(expectedFallback)).toBeInTheDocument();

    // 'Try Again' button
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();
    expect(retryBtn).toHaveTextContent("Try Again");
  });

  it("clicking 'Try Again' resets component error state without reloading the entire page", () => {
    let throwError = true;

    function StatefulTestComponent() {
      if (throwError) {
        throw new Error("Temporary crash");
      }
      return <div data-testid="healthy-ui">Healthy Component UI</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <StatefulTestComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("healthy-ui")).not.toBeInTheDocument();

    // Resolve condition and click 'Try Again'
    throwError = false;
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryBtn);

    // Component recovers without page reload
    rerender(
      <ErrorBoundary>
        <StatefulTestComponent />
      </ErrorBoundary>
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("healthy-ui")).toBeInTheDocument();
  });

  it("logs errors with stack trace to configured telemetry hook (onError callback)", () => {
    const onErrorMock = vi.fn();
    const testError = new Error("Telemetry test failure");

    function FailingComponent() {
      throw testError;
    }

    render(
      <ErrorBoundary onError={onErrorMock}>
        <FailingComponent />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    const [capturedError, capturedErrorInfo] = onErrorMock.mock.calls[0];
    expect(capturedError).toBe(testError);
    expect(capturedError.stack).toBeDefined();
    expect(capturedErrorInfo).toBeDefined();
    expect(capturedErrorInfo.componentStack).toBeDefined();
  });

  it("calls backend logger POST /api/errors when child throws", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 })
    );

    render(
      <ErrorBoundary apiBase="https://api.example.com">
        <ThrowingComponent shouldThrow={true} errorMessage="Backend log check" />
      </ErrorBoundary>
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/errors",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });
});
