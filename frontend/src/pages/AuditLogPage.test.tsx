import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AuditLogPage, AuditLogRecord } from "./AuditLogPage";

const testLogs: AuditLogRecord[] = [
  {
    id: "log-1",
    timestamp: "2026-09-25T12:00:00Z",
    actor: "GBXXX1ABCDEFGHIJKLMNO12345",
    action: "org.cap.update",
    target: "stellar-org",
    diff: "- cap: 4\n+ cap: 6",
    status: "success",
  },
  {
    id: "log-2",
    timestamp: "2026-09-25T13:00:00Z",
    actor: "GCYYY2PQRSTUVWXYZABCDE67890",
    action: "maintainer.register",
    target: "meridian-dao",
    diff: "+ maintainer: GCYYY2",
    status: "pending",
  },
];

describe("AuditLogPage (Issue #855 / FE-020)", () => {
  it("renders both desktop table and mobile cards container for responsive media query handling", () => {
    render(<AuditLogPage initialLogs={testLogs} />);

    // Table container for desktop/tablet
    const tableContainer = screen.getByTestId("audit-log-table-container");
    expect(tableContainer).toBeInTheDocument();
    expect(screen.getByTestId("audit-log-table")).toBeInTheDocument();

    // Stacked cards container for mobile (< 768px)
    const cardsContainer = screen.getByTestId("audit-log-cards-container");
    expect(cardsContainer).toBeInTheDocument();
    expect(screen.getByTestId("audit-log-cards")).toBeInTheDocument();
  });

  it("renders all audit fields (timestamp, actor, action, diff, target) in desktop table", () => {
    render(<AuditLogPage initialLogs={testLogs} />);

    const rows = screen.getAllByTestId("audit-log-row");
    expect(rows.length).toBe(2);

    expect(screen.getAllByText("org.cap.update").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("GBXXX1ABCDEFGHIJKLMNO12345").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("stellar-org").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("- cap: 4\n+ cap: 6").length).toBeGreaterThanOrEqual(1);
  });

  it("renders clean cards on mobile with all audit fields legible and structured", () => {
    render(<AuditLogPage initialLogs={testLogs} />);

    const cards = screen.getAllByTestId("audit-log-card");
    expect(cards.length).toBe(2);

    const diffs = screen.getAllByTestId("audit-log-card-diff");
    expect(diffs.length).toBe(2);
    expect(diffs[0]).toHaveTextContent("- cap: 4\n+ cap: 6");
  });

  it("displays empty state when no audit records are present", () => {
    render(<AuditLogPage initialLogs={[]} />);
    expect(screen.getByTestId("audit-log-empty")).toBeInTheDocument();
    expect(screen.getByText(/no audit logs found/i)).toBeInTheDocument();
  });

  it("displays log count badge accurately", () => {
    render(<AuditLogPage initialLogs={testLogs} />);
    expect(screen.getByTestId("audit-log-count")).toHaveTextContent("2");
  });
});
