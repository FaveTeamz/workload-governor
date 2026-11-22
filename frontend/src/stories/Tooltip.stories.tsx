import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "../components/Tooltip";
import { Gauge } from "../components/Gauge";
import { Button } from "../components/Button";

const meta = {
  title: "Design System/Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Contextual tooltip that appears on hover (desktop) and tap (mobile). " +
          "Accessible via `role=tooltip` + `aria-describedby`. Dismisses on Escape. " +
          "Auto-flips to avoid viewport edge clipping. Closes #323.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    position: {
      control: "select",
      options: ["top", "bottom", "left", "right"],
    },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
  args: {
    content: "This tooltip appears above the element.",
    position: "top",
    children: <Button variant="secondary">Hover me</Button>,
  },
};

export const Bottom: Story = {
  args: {
    content: "This tooltip appears below the element.",
    position: "bottom",
    children: <Button variant="secondary">Hover me</Button>,
  },
};

export const Left: Story = {
  args: {
    content: "This tooltip appears to the left.",
    position: "left",
    children: <Button variant="secondary">Hover me</Button>,
  },
};

export const Right: Story = {
  args: {
    content: "This tooltip appears to the right.",
    position: "right",
    children: <Button variant="secondary">Hover me</Button>,
  },
};

export const DisabledApplyButton: Story = {
  name: "Disabled Apply — cap reached",
  render: () => (
    <Tooltip
      content="You've reached the global limit of 15 pending applications. Withdraw an existing application to apply for new issues."
      position="top"
    >
      <span style={{ display: "inline-block" }}>
        <button
          className="btn btn-primary btn-sm"
          disabled
          style={{ pointerEvents: "none" }}
          aria-label="Apply (disabled)"
        >
          Apply
        </button>
      </span>
    </Tooltip>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "When the Apply button is disabled due to a cap, the tooltip explains which cap is blocking the user in plain language.",
      },
    },
  },
};

export const GaugeWithTooltip: Story = {
  name: "Gauge — global cap tooltip",
  render: () => (
    <Gauge
      value={12}
      max={15}
      label="Global Applications"
      tooltip="Tracks your pending applications across all organisations. You can have at most 15 pending at one time. When full, withdraw an existing application to make room."
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "The Gauge accepts an optional `tooltip` prop. Hover or focus the gauge to see the plain-language explanation of the metric.",
      },
    },
  },
};

export const OrgCapGauge: Story = {
  name: "Gauge — org cap tooltip",
  render: () => (
    <Gauge
      value={3}
      max={4}
      label="Org Assignments"
      tooltip="Tracks active assignments in this organisation. You can hold at most 4 active assignments per org. Complete or have an assignment revoked to free up a slot."
    />
  ),
};

export const LongContent: Story = {
  name: "Long tooltip text",
  args: {
    content:
      "This is a longer tooltip message to verify that the bubble wraps correctly and stays within the 240px max-width boundary without overflowing the viewport.",
    position: "top",
    children: <Button>Long tooltip</Button>,
  },
};

export const Playground: Story = {
  args: {
    content: "Customise this tooltip in the Controls panel.",
    position: "top",
    children: <Button>Playground</Button>,
  },
};
