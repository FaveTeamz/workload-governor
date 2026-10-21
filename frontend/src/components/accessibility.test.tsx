/**
 * Accessibility tests — closes #648
 *
 * Uses axe-core to verify no accessibility violations in the
 * status-bearing components after the color-blind-friendly update.
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { IssueCard } from "./IssueCard";
import { AssignmentCard } from "./AssignmentCard";
import { Gauge } from "./Gauge";
import { EventHistoryTable, type EventRow } from "./EventHistoryTable";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function noViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    // Suppress color-contrast checks since we don't have CSS in jsdom
    rules: { "color-contrast": { enabled: false } },
  });
  if (results.violations.length > 0) {
    const msgs = results.violations.map(
      (v) =>
        `[${v.id}] ${v.description}\n  ${v.nodes.map((n) => n.html).join("\n  ")}`
    );
    throw new Error(`Accessibility violations:\n${msgs.join("\n\n")}`);
  }
  expect(results.violations).toHaveLength(0);
}

// ─── IssueCard ────────────────────────────────────────────────────────────────

describe("IssueCard accessibility", () => {
  const BASE = { id: "42", org: "stellar-org", title: "Fix TTL bug" } as const;

  it("open status has no a11y violations", async () => {
    const { container } = render(<IssueCard {...BASE} status="open" />);
    await noViolations(container);
  });

  it("applied (pending) status has no a11y violations", async () => {
    const { container } = render(<IssueCard {...BASE} status="applied" />);
    await noViolations(container);
  });

  it("assigned status has no a11y violations", async () => {
    const { container } = render(<IssueCard {...BASE} status="assigned" />);
    await noViolations(container);
  });

  it("completed status has no a11y violations", async () => {
    const { container } = render(<IssueCard {...BASE} status="completed" />);
    await noViolations(container);
  });

  it("disabled apply button with reason has no a11y violations", async () => {
    const { container } = render(
      <IssueCard
        {...BASE}
        status="open"
        applyDisabledReason="Global limit of 15 reached"
      />
    );
    await noViolations(container);
  });
});

// ─── AssignmentCard ───────────────────────────────────────────────────────────

describe("AssignmentCard accessibility", () => {
  const BASE = {
    issueId: "a1",
    org: "stellar-org",
    title: "Optimize WASM binary size",
    contributor: "GBXXX1ABCDEFGHIJKLMNO12345",
  } as const;

  it("assigned status has no a11y violations", async () => {
    const { container } = render(
      <AssignmentCard {...BASE} status="assigned" />
    );
    await noViolations(container);
  });

  it("completed status has no a11y violations", async () => {
    const { container } = render(
      <AssignmentCard {...BASE} status="completed" />
    );
    await noViolations(container);
  });

  it("revoked status has no a11y violations", async () => {
    const { container } = render(
      <AssignmentCard {...BASE} status="revoked" />
    );
    await noViolations(container);
  });

  it("with action buttons has no a11y violations", async () => {
    const { container } = render(
      <AssignmentCard
        {...BASE}
        status="assigned"
        onComplete={() => {}}
        onRevoke={() => {}}
      />
    );
    await noViolations(container);
  });
});

// ─── Gauge ────────────────────────────────────────────────────────────────────

describe("Gauge accessibility", () => {
  it("low workload (value=3) has no a11y violations", async () => {
    const { container } = render(
      <Gauge value={3} max={15} label="Global applications" />
    );
    await noViolations(container);
  });

  it("medium workload (value=10) has no a11y violations", async () => {
    const { container } = render(
      <Gauge value={10} max={15} label="Global applications" />
    );
    await noViolations(container);
  });

  it("high workload (value=14) has no a11y violations", async () => {
    const { container } = render(
      <Gauge value={14} max={15} label="Global applications" />
    );
    await noViolations(container);
  });

  it("with tooltip has no a11y violations", async () => {
    const { container } = render(
      <Gauge value={7} max={15} label="Global applications" tooltip="You have 7 of 15 applications used" />
    );
    await noViolations(container);
  });
});

// ─── EventHistoryTable ────────────────────────────────────────────────────────

const SAMPLE_EVENTS: EventRow[] = [
  {
    id: "1",
    eventType: "applied",
    org: "stellar-org",
    issueId: "42",
    contributor: "GBXXX1ABCDEFGHIJKLMNO12345",
    timestamp: "2026-06-01T10:00:00Z",
  },
  {
    id: "2",
    eventType: "assigned",
    org: "stellar-org",
    issueId: "42",
    contributor: "GCYYY2PQRSTUVWXYZABCDE67890",
    timestamp: "2026-06-02T11:30:00Z",
  },
  {
    id: "3",
    eventType: "completed",
    org: "meridian-dao",
    issueId: "17",
    contributor: "GAZZZ3FGHIJKLMNOPQRST11111",
    timestamp: "2026-06-03T09:00:00Z",
  },
  {
    id: "4",
    eventType: "revoked",
    org: "soroban-labs",
    issueId: "55",
    contributor: "GDWWW4LMNOPQRSTUVWXYZ22222",
    timestamp: "2026-06-04T14:00:00Z",
  },
  {
    id: "5",
    eventType: "withdrawn",
    org: "meridian-dao",
    issueId: "20",
    contributor: "GBXXX1ABCDEFGHIJKLMNO12345",
    timestamp: "2026-06-05T16:00:00Z",
  },
];

describe("EventHistoryTable accessibility", () => {
  it("with events has no a11y violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <EventHistoryTable events={SAMPLE_EVENTS} />
      </MemoryRouter>
    );
    await noViolations(container);
  });

  it("empty state has no a11y violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <EventHistoryTable events={[]} />
      </MemoryRouter>
    );
    await noViolations(container);
  });
});
