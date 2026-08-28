/**
 * EventHistoryTable stories — #647
 */
import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { EventHistoryTable, type EventRow } from "../components/EventHistoryTable";

const meta: Meta<typeof EventHistoryTable> = {
  title: "Data/EventHistoryTable",
  component: EventHistoryTable,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ background: "var(--color-bg)", padding: "24px" }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
};
export default meta;
type Story = StoryObj<typeof EventHistoryTable>;

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const ORGS = ["stellar-org", "meridian-dao", "soroban-labs", "horizon-db"];
const CONTRIBUTORS = [
  "GBXXX1ABCDEFGHIJKLMNO12345",
  "GCYYY2PQRSTUVWXYZABCDE67890",
  "GAZZZ3FGHIJKLMNOPQRST11111",
  "GDWWW4LMNOPQRSTUVWXYZ22222",
];
const TYPES: EventRow["eventType"][] = [
  "applied",
  "withdrawn",
  "assigned",
  "completed",
  "revoked",
];

function makeEvents(count: number): EventRow[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    eventType: TYPES[i % TYPES.length],
    org: ORGS[i % ORGS.length],
    issueId: String(100 + i),
    contributor: CONTRIBUTORS[i % CONTRIBUTORS.length],
    timestamp: new Date(now - i * 3_600_000).toISOString(), // 1h apart
  }));
}

// ─── Stories ─────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    events: makeEvents(10),
    caption: "Recent Events",
  },
};

export const LargeDataset: Story = {
  name: "Large Dataset (100 events)",
  args: {
    events: makeEvents(100),
    caption: "Event History — 100 entries",
  },
};

export const WithFiltersPreApplied: Story = {
  name: "With Filters (assigned only)",
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/?eventType=assigned"]}>
        <div style={{ background: "var(--color-bg)", padding: "24px" }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    events: makeEvents(20),
    caption: "Event History",
  },
};

export const Empty: Story = {
  args: {
    events: [],
    caption: "Event History",
  },
};

export const AllFilteredOut: Story = {
  name: "All Filtered Out",
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/?eventType=revoked&org=nonexistent-org"]}>
        <div style={{ background: "var(--color-bg)", padding: "24px" }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    events: makeEvents(10),
    caption: "Event History",
  },
};
