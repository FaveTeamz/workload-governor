import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta = {
  title: "Design System/Badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "success", "warning", "danger", "info"],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Individual variants ───────────────────────────────────────

/** Neutral / no status. */
export const Default: Story = {
  args: { variant: "default", children: "Draft" },
};

/** Positive outcome or active state. */
export const Success: Story = {
  args: { variant: "success", children: "Active" },
};

/** Caution — approaching a limit. */
export const Warning: Story = {
  args: { variant: "warning", children: "Near limit" },
};

/** Error or blocked state. */
export const Danger: Story = {
  args: { variant: "danger", children: "Rejected" },
};

/** Informational tag or metadata. */
export const Info: Story = {
  args: { variant: "info", children: "Pending" },
};

// ── Dark-mode snapshots ───────────────────────────────────────

export const DefaultDark: Story = {
  args: { variant: "default", children: "Draft" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const SuccessDark: Story = {
  args: { variant: "success", children: "Active" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const WarningDark: Story = {
  args: { variant: "warning", children: "Near limit" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const DangerDark: Story = {
  args: { variant: "danger", children: "Rejected" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const InfoDark: Story = {
  args: { variant: "info", children: "Pending" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

// ── Full grid (light + dark side-by-side in one snapshot) ─────

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      <Badge variant="default">Draft</Badge>
      <Badge variant="success">Active</Badge>
      <Badge variant="warning">Near limit</Badge>
      <Badge variant="danger">Rejected</Badge>
      <Badge variant="info">Pending</Badge>
    </div>
  ),
};

export const AllVariantsDark: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      <Badge variant="default">Draft</Badge>
      <Badge variant="success">Active</Badge>
      <Badge variant="warning">Near limit</Badge>
      <Badge variant="danger">Rejected</Badge>
      <Badge variant="info">Pending</Badge>
    </div>
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};
