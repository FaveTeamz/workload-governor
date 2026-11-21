import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";
import { Button } from "./Button";
import { Badge } from "./Badge";

const meta = {
  title: "Design System/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Structural variants ───────────────────────────────────────

/** Card with a title only. */
export const TitleOnly: Story = {
  args: {
    title: "WorkloadGovernor",
  },
};

/** Card with title and subtitle. */
export const WithSubtitle: Story = {
  args: {
    title: "Contributor Profile",
    subtitle: "GBXXX1ABCDEFGHIJKLMNO12345",
    children: "This contributor has 3 active assignments across 2 organisations.",
  },
};

/** Full card with header, body content, and footer actions. */
export const WithFooter: Story = {
  args: {
    title: "Issue Assignment",
    subtitle: "stellar-org",
    children: (
      <p>Fix TTL extension bug — the ledger closes before the TTL is bumped.</p>
    ),
    footer: (
      <>
        <Button variant="primary" size="sm">Assign</Button>
        <Button variant="ghost" size="sm">Dismiss</Button>
      </>
    ),
  },
};

/** Card containing a badge and supplementary metadata. */
export const WithBadge: Story = {
  render: () => (
    <Card
      title="Application #42"
      subtitle="meridian-dao"
      footer={<Button variant="secondary" size="sm">View details</Button>}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <Badge variant="info">Pending</Badge>
        <span style={{ fontSize: "0.875rem", color: "var(--ds-text-muted)" }}>
          Applied 2026-06-20
        </span>
      </div>
    </Card>
  ),
};

/** Empty card (no content). */
export const Empty: Story = {
  args: {
    title: "No Assignments",
    children: "This contributor has no active assignments.",
  },
};

// ── Dark-mode snapshots ───────────────────────────────────────

export const WithFooterDark: Story = {
  args: {
    title: "Issue Assignment",
    subtitle: "stellar-org",
    children: (
      <p>Fix TTL extension bug — the ledger closes before the TTL is bumped.</p>
    ),
    footer: (
      <>
        <Button variant="primary" size="sm">Assign</Button>
        <Button variant="ghost" size="sm">Dismiss</Button>
      </>
    ),
  },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const WithBadgeDark: Story = {
  render: () => (
    <Card
      title="Application #42"
      subtitle="meridian-dao"
      footer={<Button variant="secondary" size="sm">View details</Button>}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <Badge variant="info">Pending</Badge>
        <span style={{ fontSize: "0.875rem", color: "var(--ds-text-muted)" }}>
          Applied 2026-06-20
        </span>
      </div>
    </Card>
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};
