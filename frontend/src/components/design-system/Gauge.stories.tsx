import type { Meta, StoryObj } from "@storybook/react";
import { Gauge } from "./Gauge";

const meta = {
  title: "Design System/Gauge",
  component: Gauge,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 15, step: 1 } },
    max: { control: { type: "number", min: 1 } },
    size: { control: { type: "range", min: 40, max: 200, step: 8 } },
    strokeWidth: { control: { type: "range", min: 2, max: 24, step: 1 } },
  },
} satisfies Meta<typeof Gauge>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Threshold states (0-50 % = green, 51-80 % = amber, 81-100 % = red) ──

/** Low utilisation — green zone. */
export const LowUsage: Story = {
  args: {
    value: 3,
    max: 15,
    label: "Global applications",
    "aria-label": "3 of 15 global applications used",
  },
};

/** Mid utilisation — amber zone (>50 %). */
export const MediumUsage: Story = {
  args: {
    value: 9,
    max: 15,
    label: "Global applications",
    "aria-label": "9 of 15 global applications used",
  },
};

/** High utilisation — red zone (>80 %). */
export const HighUsage: Story = {
  args: {
    value: 13,
    max: 15,
    label: "Global applications",
    "aria-label": "13 of 15 global applications used",
  },
};

/** At maximum — full red. */
export const AtMax: Story = {
  args: {
    value: 15,
    max: 15,
    label: "Global cap reached",
    "aria-label": "15 of 15 global applications used",
  },
};

/** Empty — nothing used yet. */
export const Empty: Story = {
  args: {
    value: 0,
    max: 15,
    label: "Global applications",
    "aria-label": "0 of 15 global applications used",
  },
};

/** Org-level assignment cap (max 4). */
export const OrgCapNearLimit: Story = {
  args: {
    value: 3,
    max: 4,
    label: "Org assignments",
    "aria-label": "3 of 4 org assignments used",
  },
};

// ── Size variants ────────────────────────────────────────────────

export const Small: Story = {
  args: { value: 7, max: 15, label: "Applications", size: 56, strokeWidth: 5 },
};

export const Large: Story = {
  args: { value: 7, max: 15, label: "Applications", size: 120, strokeWidth: 12 },
};

// ── Grid showing all threshold levels ─────────────────────────

export const AllThresholds: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-end" }}>
      <Gauge value={0} max={15} label="Empty" />
      <Gauge value={3} max={15} label="Low (3/15)" />
      <Gauge value={9} max={15} label="Medium (9/15)" />
      <Gauge value={13} max={15} label="High (13/15)" />
      <Gauge value={15} max={15} label="Full (15/15)" />
    </div>
  ),
};

// ── Dark-mode snapshots ──────────────────────────────────────────

export const AllThresholdsDark: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-end" }}>
      <Gauge value={0} max={15} label="Empty" />
      <Gauge value={3} max={15} label="Low (3/15)" />
      <Gauge value={9} max={15} label="Medium (9/15)" />
      <Gauge value={13} max={15} label="High (13/15)" />
      <Gauge value={15} max={15} label="Full (15/15)" />
    </div>
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const LowUsageDark: Story = {
  args: {
    value: 3,
    max: 15,
    label: "Global applications",
  },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const HighUsageDark: Story = {
  args: {
    value: 13,
    max: 15,
    label: "Global applications",
  },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};
