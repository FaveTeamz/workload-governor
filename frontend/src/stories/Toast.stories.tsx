/**
 * Toast stories — #649
 *
 * All variants, stacked state, and auto-dismiss demo.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { ToastContainer } from "../components/Toast";
import type { Toast } from "../components/Toast";

const meta: Meta<typeof ToastContainer> = {
  title: "Feedback/Toast",
  component: ToastContainer,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Toast notifications for transaction events. " +
          "Uses `ToastProvider` + `useToast()` in the app; " +
          "stories render `ToastContainer` directly for static display.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          minHeight: "300px",
          background: "var(--color-bg)",
          padding: "24px",
        }}
      >
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ToastContainer>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function noop() {}

function toast(
  id: number,
  message: string,
  variant: Toast["variant"],
  dismissing = false
): Toast {
  return { id, message, variant, dismissing };
}

// ─── Stories ────────────────────────────────────────────────────────────────

export const Success: Story = {
  args: {
    toasts: [toast(1, "Assignment completed successfully.", "success")],
    onRemove: noop,
  },
};

export const Error: Story = {
  args: {
    toasts: [toast(2, "Transaction failed: insufficient fee.", "error")],
    onRemove: noop,
  },
};

export const Warning: Story = {
  args: {
    toasts: [
      toast(
        3,
        "Application TTL expires in 24 hours — extend now to keep your spot.",
        "warning"
      ),
    ],
    onRemove: noop,
  },
};

export const Info: Story = {
  args: {
    toasts: [toast(4, "Transaction submitted. Waiting for confirmation…", "info")],
    onRemove: noop,
  },
};

export const Stacked: Story = {
  name: "Stacked (3 toasts)",
  args: {
    toasts: [
      toast(1, "Transaction submitted. Waiting for confirmation…", "info"),
      toast(
        2,
        "Application TTL expires in 24 hours — extend now to keep your spot.",
        "warning"
      ),
      toast(3, "Assignment completed successfully.", "success"),
    ],
    onRemove: noop,
  },
};

export const WithDismissing: Story = {
  name: "Dismissing (fade-out state)",
  args: {
    toasts: [
      toast(1, "Transaction submitted. Waiting for confirmation…", "info"),
      toast(2, "This toast is being dismissed.", "success", true),
    ],
    onRemove: noop,
  },
};
