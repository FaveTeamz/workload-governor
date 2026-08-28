/**
 * ActivityTimeline stories — #651
 */
import type { Meta, StoryObj } from "@storybook/react";
import { ActivityTimeline, type TimelineEvent } from "../components/ActivityTimeline";
import { MemoryRouter } from "react-router-dom";

const meta: Meta<typeof ActivityTimeline> = {
  title: "Pages/ActivityTimeline",
  component: ActivityTimeline,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div
          style={{
            background: "var(--color-bg)",
            minHeight: "400px",
            padding: "24px",
          }}
        >
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ActivityTimeline>;

// ─── Mock fetch helpers ──────────────────────────────────────────────────────

function makeFetch(events: TimelineEvent[], hasMore = false): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ events, pagination: { hasMore } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
}

function makeErrorFetch(): typeof fetch {
  return () => Promise.resolve(new Response(null, { status: 500 }));
}

function makeLoadingFetch(): typeof fetch {
  return () => new Promise(() => {/* never resolves */}) as unknown as Promise<Response>;
}

// ─── Data fixtures ────────────────────────────────────────────────────────────

const NOW = Date.now();
const HOUR = 3_600_000;
const DAY  = 86_400_000;

function evt(
  id: string,
  event_type: TimelineEvent["event_type"],
  issue_id: number,
  org_id: string,
  offsetMs: number,
  issue_title?: string
): TimelineEvent {
  return {
    id,
    event_type,
    issue_id,
    org_id,
    issue_title,
    timestamp: new Date(NOW - offsetMs).toISOString(),
  };
}

const POPULATED_EVENTS: TimelineEvent[] = [
  evt("1",  "completed", 42,  "stellar-org",   1 * HOUR,  "Optimize WASM binary size"),
  evt("2",  "assigned",  37,  "stellar-org",   3 * HOUR,  "Fix TTL extension bug"),
  evt("3",  "applied",   55,  "meridian-dao",  5 * HOUR,  "Add fee-bump support"),
  evt("4",  "withdrawn", 20,  "meridian-dao",  1 * DAY,   "Deprecated endpoint cleanup"),
  evt("5",  "revoked",   13,  "stellar-org",   1 * DAY + 2 * HOUR),
  evt("6",  "completed", 8,   "stellar-org",   2 * DAY,   "Integration tests for SDK"),
  evt("7",  "applied",   61,  "soroban-labs",  3 * DAY,   "Add state rent calculation"),
  evt("8",  "assigned",  44,  "soroban-labs",  4 * DAY,   "Refactor auth module"),
  evt("9",  "applied",   72,  "meridian-dao",  6 * DAY,   "CLI: support mainnet flag"),
  evt("10", "withdrawn", 72,  "meridian-dao",  6 * DAY + 1 * HOUR),
  evt("11", "completed", 33,  "stellar-org",   8 * DAY,   "Error handling middleware"),
  evt("12", "applied",   80,  "soroban-labs",  9 * DAY,   "Contract upgrade guide"),
  evt("13", "assigned",  80,  "soroban-labs",  10 * DAY,  "Contract upgrade guide"),
  evt("14", "revoked",   15,  "meridian-dao",  15 * DAY),
  evt("15", "applied",   90,  "stellar-org",   16 * DAY,  "Horizon pagination cursor"),
  evt("16", "completed", 7,   "soroban-labs",  18 * DAY,  "Unit test coverage boost"),
  evt("17", "applied",   101, "meridian-dao",  20 * DAY,  "Multi-org auth refactor"),
  evt("18", "assigned",  101, "meridian-dao",  21 * DAY,  "Multi-org auth refactor"),
  evt("19", "completed", 101, "meridian-dao",  22 * DAY,  "Multi-org auth refactor"),
  evt("20", "applied",   110, "stellar-org",   40 * DAY,  "Archive old ledger entries"),
];

// ─── Stories ─────────────────────────────────────────────────────────────────

export const Populated: Story = {
  args: {
    address: "GBXXX1ABCDEFGHIJKLMNO12345",
    fetchFn: makeFetch(POPULATED_EVENTS),
  },
};

export const Loading: Story = {
  args: {
    address: "GBXXX1ABCDEFGHIJKLMNO12345",
    fetchFn: makeLoadingFetch(),
  },
};

export const Empty: Story = {
  args: {
    address: "GBXXX1ABCDEFGHIJKLMNO12345",
    fetchFn: makeFetch([]),
  },
};

export const ErrorState: Story = {
  name: "Error",
  args: {
    address: "GBXXX1ABCDEFGHIJKLMNO12345",
    fetchFn: makeErrorFetch(),
  },
};

export const WithLoadMore: Story = {
  args: {
    address: "GBXXX1ABCDEFGHIJKLMNO12345",
    fetchFn: makeFetch(POPULATED_EVENTS.slice(0, 10), true /* hasMore */),
  },
};
