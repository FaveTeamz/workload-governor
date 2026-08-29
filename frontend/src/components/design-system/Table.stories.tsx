import type { Meta, StoryObj } from "@storybook/react";
import { Table, type ColumnDef } from "./Table";
import { Badge } from "./Badge";
import type { BadgeVariant } from "./Badge";

const meta = {
  title: "Design System/Table",
  component: Table,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Sample data ────────────────────────────────────────────────
interface Application {
  id: string;
  contributor: string;
  org: string;
  issue: string;
  status: string;
  appliedDate: string;
}

const APPLICATIONS: Application[] = [
  {
    id: "1",
    contributor: "GBXXX1ABCD",
    org: "stellar-org",
    issue: "Fix TTL extension bug",
    status: "Pending",
    appliedDate: "2026-06-20",
  },
  {
    id: "2",
    contributor: "GCYYY2PQRS",
    org: "stellar-org",
    issue: "Add prop tests for assign_issue",
    status: "Pending",
    appliedDate: "2026-06-21",
  },
  {
    id: "3",
    contributor: "GAZZZ3FGHI",
    org: "meridian-dao",
    issue: "Docs: storage design overview",
    status: "Assigned",
    appliedDate: "2026-06-22",
  },
  {
    id: "4",
    contributor: "GDWWW4LMNO",
    org: "meridian-dao",
    issue: "Integration tests for SDK",
    status: "Completed",
    appliedDate: "2026-06-18",
  },
];

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  Pending: "info",
  Assigned: "warning",
  Completed: "success",
  Rejected: "danger",
};

const columns: ColumnDef<Application>[] = [
  {
    key: "contributor",
    header: "Contributor",
    render: (row) => <code style={{ fontFamily: "monospace" }}>{row.contributor}</code>,
  },
  {
    key: "org",
    header: "Organisation",
    render: (row) => row.org,
  },
  {
    key: "issue",
    header: "Issue",
    render: (row) => row.issue,
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={STATUS_VARIANT[row.status] ?? "default"}>
        {row.status}
      </Badge>
    ),
    align: "center",
  },
  {
    key: "appliedDate",
    header: "Applied",
    render: (row) => row.appliedDate,
    align: "right",
  },
];

// ── Stories ─────────────────────────────────────────────────────

/** Table populated with application rows. */
export const Default: Story = {
  render: () => (
    <Table<Application>
      caption="Contributor Applications"
      columns={columns}
      data={APPLICATIONS}
      rowKey={(row) => row.id}
    />
  ),
};

/** Table in loading state. */
export const Loading: Story = {
  render: () => (
    <Table<Application>
      caption="Contributor Applications"
      columns={columns}
      data={[]}
      rowKey={(row) => row.id}
      loading
    />
  ),
};

/** Table with no data — empty state message. */
export const Empty: Story = {
  render: () => (
    <Table<Application>
      caption="Contributor Applications"
      columns={columns}
      data={[]}
      rowKey={(row) => row.id}
      emptyMessage="No applications found."
    />
  ),
};

// ── Dark-mode snapshots ──────────────────────────────────────────

export const DefaultDark: Story = {
  render: () => (
    <Table<Application>
      caption="Contributor Applications"
      columns={columns}
      data={APPLICATIONS}
      rowKey={(row) => row.id}
    />
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const EmptyDark: Story = {
  render: () => (
    <Table<Application>
      caption="Contributor Applications"
      columns={columns}
      data={[]}
      rowKey={(row) => row.id}
      emptyMessage="No applications found."
    />
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};
