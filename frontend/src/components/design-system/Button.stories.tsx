import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Design System/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Base variants ─────────────────────────────────────────────

/** The default call-to-action button. */
export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Primary",
  },
};

/** Outlined, lower visual weight. */
export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary",
  },
};

/** Minimal treatment, used inline or in toolbars. */
export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost",
  },
};

// ── Size variants ─────────────────────────────────────────────

export const SizeSmall: Story = {
  args: { variant: "primary", size: "sm", children: "Small" },
};

export const SizeMedium: Story = {
  args: { variant: "primary", size: "md", children: "Medium" },
};

export const SizeLarge: Story = {
  args: { variant: "primary", size: "lg", children: "Large" },
};

// ── State variants ────────────────────────────────────────────

export const Loading: Story = {
  args: { variant: "primary", loading: true, children: "Loading" },
};

export const Disabled: Story = {
  args: { variant: "primary", disabled: true, children: "Disabled" },
};

// ── Dark-mode snapshots ───────────────────────────────────────

export const PrimaryDark: Story = {
  args: { variant: "primary", children: "Primary" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const SecondaryDark: Story = {
  args: { variant: "secondary", children: "Secondary" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const GhostDark: Story = {
  args: { variant: "ghost", children: "Ghost" },
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

// ── All variants at once (for a quick visual grid) ────────────

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" size="lg">Large</Button>
      <Button variant="primary" loading>Loading</Button>
      <Button variant="primary" disabled>Disabled</Button>
    </div>
  ),
};

export const AllVariantsDark: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" size="lg">Large</Button>
      <Button variant="primary" loading>Loading</Button>
      <Button variant="primary" disabled>Disabled</Button>
    </div>
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};
