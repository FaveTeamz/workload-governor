import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AnimatedCount } from "../components/AnimatedCount";

const meta: Meta<typeof AnimatedCount> = {
  title: "Components/AnimatedCount",
  component: AnimatedCount,
  parameters: {
    docs: {
      description: {
        component:
          "Smoothly animates a numeric value using requestAnimationFrame. Respects prefers-reduced-motion.",
      },
    },
  },
  argTypes: {
    value: { control: { type: "number" } },
    duration: { control: { type: "range", min: 100, max: 2000, step: 100 } },
  },
};
export default meta;
type Story = StoryObj<typeof AnimatedCount>;

export const Default: Story = {
  args: { value: 7, duration: 500 },
};

export const WithFormatter: Story = {
  args: {
    value: 14,
    duration: 800,
    formatter: (n) => `${n} / 15`,
  },
};

export const Decrement: Story = {
  args: { value: 3, duration: 500 },
};

/** Interactive demo: click button to animate count */
export const Interactive: Story = {
  render: () => {
    const [count, setCount] = useState(0);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
        <div style={{ fontSize: "3rem", fontWeight: 700, minWidth: "4ch", textAlign: "center" }}>
          <AnimatedCount value={count} duration={500} aria-label={`Current cap usage: ${count}`} />
          <span style={{ fontSize: "1.5rem", color: "#94a3b8" }}> / 15</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ padding: "6px 16px", background: "#6c8eff", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
            onClick={() => setCount((c) => Math.min(c + 1, 15))}
          >
            Apply +1
          </button>
          <button
            style={{ padding: "6px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
            onClick={() => setCount((c) => Math.max(c - 1, 0))}
          >
            Withdraw −1
          </button>
          <button
            style={{ padding: "6px 16px", border: "1px solid #2e3347", background: "none", color: "#e2e8f0", borderRadius: 6, cursor: "pointer" }}
            onClick={() => setCount(0)}
          >
            Reset
          </button>
        </div>
      </div>
    );
  },
};
