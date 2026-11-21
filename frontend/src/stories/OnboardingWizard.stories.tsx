import type { Meta, StoryObj } from "@storybook/react";
import { OnboardingWizard } from "../components/OnboardingWizard";

/**
 * The OnboardingWizard walks first-time contributors through:
 * 1. Connect Wallet — Freighter install + connection
 * 2. Understanding Caps — 15-global / 4-per-org cap explainer
 * 3. Find an Issue — Guided org filter to browse open issues
 *
 * The wizard is localStorage-gated in production; use `forceVisible` to bypass
 * the gate in Storybook. Use `initialStep` to jump to any step.
 */
const meta: Meta<typeof OnboardingWizard> = {
  title: "Wizard/OnboardingWizard",
  component: OnboardingWizard,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "3-step onboarding wizard shown on first visit. localStorage-gated. " +
          "Keyboard-navigable with full ARIA support and focus trap.",
      },
    },
  },
  argTypes: {
    walletConnected: { control: "boolean" },
    forceVisible: { control: "boolean" },
    initialStep: {
      control: { type: "range", min: 0, max: 2, step: 1 },
    },
    onComplete: { action: "onComplete" },
    onConnectWallet: { action: "onConnectWallet" },
  },
  // Default args shared by all stories
  args: {
    forceVisible: true,
    walletConnected: false,
    initialStep: 0,
  },
};

export default meta;
type Story = StoryObj<typeof OnboardingWizard>;

// ─────────────────────────────────────────────────────────────────────────────
// Individual step stories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 1: Connect Wallet
 * Shows the Freighter install prompt and Connect Wallet button.
 */
export const Step1ConnectWallet: Story = {
  name: "Step 1 — Connect Wallet",
  args: {
    initialStep: 0,
    walletConnected: false,
  },
};

/**
 * Step 1 — wallet already connected state.
 * The connect prompt is replaced with a success message.
 */
export const Step1WalletAlreadyConnected: Story = {
  name: "Step 1 — Wallet Connected",
  args: {
    initialStep: 0,
    walletConnected: true,
  },
};

/**
 * Step 2: Understanding Caps
 * Visual explainer of the 15-global / 4-per-org fairness caps.
 */
export const Step2UnderstandingCaps: Story = {
  name: "Step 2 — Understanding Caps",
  args: {
    initialStep: 1,
  },
};

/**
 * Step 3: Find an Issue
 * Guided org filter and Browse Issues CTA.
 */
export const Step3FindAnIssue: Story = {
  name: "Step 3 — Find an Issue",
  args: {
    initialStep: 2,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Additional state stories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default first-visit experience starting at step 1.
 */
export const Default: Story = {
  name: "Default (first visit)",
  args: {
    initialStep: 0,
    walletConnected: false,
  },
};

/**
 * The wizard hidden after the user has completed it.
 * forceVisible=false + no localStorage override means the wizard won't show.
 * This story renders nothing (the component returns null).
 */
export const AlreadyCompleted: Story = {
  name: "Already Completed (hidden)",
  args: {
    forceVisible: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "When `forceVisible` is false and the localStorage key is set, " +
          "the wizard renders nothing. The user sees the main dashboard.",
      },
    },
  },
};
