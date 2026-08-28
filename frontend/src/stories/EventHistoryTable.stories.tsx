import type { Meta, StoryObj } from "@storybook/react";
import { EventHistoryTable } from "../components/EventHistoryTable";
import type { ContractEvent } from "../components/EventHistoryTable";

function makeEvent(overrides: Partial<ContractEvent> & { id: string }): ContractEvent {
  return {
    event_type: "application",
    org_id: "stellar-org",
    issue_id: "42",
    timestamp: new Date().toISOString(),
    tx_hash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    contributor: "GBXXX1ABCDEFGHIJKLMNO12345",
    ...overrides,
  };
}

const SAMPLE_EVENTS: ContractEvent[] = [
  makeEvent({ id: "1", event_type: "application", timestamp: "2026-06-20T10:00:00Z", issue_id: "42", org_id: "stellar-org", tx_hash: "aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344" }),
  makeEvent({ id: "2", event_type: "assignment",  timestamp: "2026-06-21T14:30:00Z", issue_id: "42", org_id: "stellar-org", tx_hash: "bbccddee22334455bbccddee22334455bbccddee22334455bbccddee22334455" }),
  makeEvent({ id: "3", event_type: "completion",  timestamp: "2026-06-22T09:15:00Z", issue_id: "42", org_id: "stellar-org", tx_hash: "ccddeeff33445566ccddeeff33445566ccddeeff33445566ccddeeff33445566" }),
  makeEvent({ id: "4", event_type: "revocation",  timestamp: "2026-06-23T17:45:00Z", issue_id: "99", org_id: "meridian-dao", tx_hash: "ddeeff0044556677ddeeff0044556677ddeeff0044556677ddeeff0044556677" }),
  makeEvent({ id: "5", event_type: "application", timestamp: "2026-06-24T08:00:00Z", issue_id: "105", org_id: "stellar-org", tx_hash: "eeff001155667788eeff001155667788eeff001155667788eeff001155667788" }),
];

const meta: Meta<typeof EventHistoryTable> = {
  title: "Components/EventHistoryTable",
  component: EventHistoryTable,
  parameters: {
    docs: {
      description: {
        component:
          "Paginated, sortable, filterable event history table. Client-side 25 rows/page. Copy-to-clipboard on tx hash.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof EventHistoryTable>;

export const WithEvents: Story = {
  args: { events: SAMPLE_EVENTS },
};

export const Empty: Story = {
  args: { events: [] },
};

/** 30 rows to exercise pagination */
export const ManyEvents: Story = {
  args: {
    events: Array.from({ length: 30 }, (_, i) =>
      makeEvent({
        id: String(i),
        event_type: (["application", "assignment", "completion", "revocation"] as const)[i % 4],
        timestamp: new Date(Date.now() - i * 3_600_000).toISOString(),
        issue_id: String(100 + i),
        org_id: i % 2 === 0 ? "stellar-org" : "meridian-dao",
        tx_hash: `${"0123456789abcdef".repeat(4).slice(i % 16, i % 16 + 64)}`.padEnd(64, "0"),
      })
    ),
  },
};
