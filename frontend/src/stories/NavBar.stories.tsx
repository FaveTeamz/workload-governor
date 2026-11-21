/**
 * NavBar.stories.tsx
 *
 * Storybook stories for the NavBar component (issue #650).
 *
 * Covers all required states:
 *   - Empty wallet (not connected)
 *   - Connected wallet, cap levels: low / warning / critical
 *   - Mobile hamburger open
 *   - Mobile hamburger closed
 *   - With unread notifications
 *   - No unread notifications
 */

import type { Meta, StoryObj } from "@storybook/react";
import { NavBar, type NavBarProps } from "../components/NavBar";
import "../components/navbar.css";
import "../i18n"; // initialise i18next with all locales

const SAMPLE_ORGS = [
  { id: "stellar-oss",    name: "stellar-oss" },
  { id: "alignmentdrips", name: "alignmentdrips" },
  { id: "soroban-tools",  name: "soroban-tools" },
];

const WALLET_ADDRESS = "GBZX4364PEPQTDICMIQDZ56K4T75QZCR4NBEYKO6PDRJAHZKGUOJPCXB";

const meta: Meta<typeof NavBar> = {
  title: "Navigation/NavBar",
  component: NavBar,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Top navigation bar with org switcher, cap status chip, notification badge, and responsive hamburger menu.",
      },
    },
  },
  argTypes: {
    globalApplicationCount: {
      control: { type: "range", min: 0, max: 15, step: 1 },
      description: "Number of pending global applications (0–15)",
    },
    unreadNotificationCount: {
      control: { type: "number", min: 0 },
      description: "Number of unread notifications",
    },
    walletAddress: {
      control: "text",
      description: "Connected Stellar address, or null",
    },
  },
  args: {
    recentOrgs: SAMPLE_ORGS,
    selectedOrg: SAMPLE_ORGS[0],
    onOrgSelect: (org) => console.log("onOrgSelect", org),
    onConnectWallet: () => console.log("onConnectWallet"),
    onDisconnect: () => console.log("onDisconnect"),
    onNotificationsOpen: () => console.log("onNotificationsOpen"),
  },
};

export default meta;
type Story = StoryObj<typeof NavBar>;

// ── 1. No wallet connected ────────────────────────────────────────────────────

export const NoWallet: Story = {
  name: "Empty wallet (not connected)",
  args: {
    walletAddress: null,
    globalApplicationCount: 0,
    unreadNotificationCount: 0,
    selectedOrg: null,
  },
  parameters: {
    docs: {
      description: { story: "User has not connected a wallet. Shows 'Connect Wallet' button; cap chip is hidden." },
    },
  },
};

// ── 2. Connected — low cap (green chip) ───────────────────────────────────────

export const CapLow: Story = {
  name: "Connected — low cap (green, < 10)",
  args: {
    walletAddress: WALLET_ADDRESS,
    globalApplicationCount: 3,
    unreadNotificationCount: 0,
    selectedOrg: SAMPLE_ORGS[0],
  },
  parameters: {
    docs: {
      description: { story: "3/15 applications — chip is green. No unread notifications." },
    },
  },
};

// ── 3. Connected — warning cap (yellow chip) ──────────────────────────────────

export const CapWarning: Story = {
  name: "Connected — warning cap (yellow, 10–13)",
  args: {
    walletAddress: WALLET_ADDRESS,
    globalApplicationCount: 11,
    unreadNotificationCount: 2,
    selectedOrg: SAMPLE_ORGS[0],
  },
  parameters: {
    docs: {
      description: { story: "11/15 applications — chip is yellow. 2 unread notifications." },
    },
  },
};

// ── 4. Connected — critical cap (red chip) ────────────────────────────────────

export const CapCritical: Story = {
  name: "Connected — critical cap (red, 14–15)",
  args: {
    walletAddress: WALLET_ADDRESS,
    globalApplicationCount: 15,
    unreadNotificationCount: 7,
    selectedOrg: SAMPLE_ORGS[1],
  },
  parameters: {
    docs: {
      description: { story: "15/15 — chip is red (limit reached). 7 unread notifications shown with badge." },
    },
  },
};

// ── 5. Mobile — hamburger closed ─────────────────────────────────────────────

export const MobileHamburgerClosed: Story = {
  name: "Mobile — hamburger closed (< 768px)",
  args: {
    walletAddress: WALLET_ADDRESS,
    globalApplicationCount: 5,
    unreadNotificationCount: 1,
    selectedOrg: SAMPLE_ORGS[0],
  },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    docs: {
      description: { story: "Below 768px: nav links are hidden, hamburger button is visible." },
    },
  },
};

// ── 6. Mobile — hamburger open ────────────────────────────────────────────────

export const MobileHamburgerOpen: Story = {
  name: "Mobile — hamburger open (< 768px)",
  args: {
    walletAddress: WALLET_ADDRESS,
    globalApplicationCount: 5,
    unreadNotificationCount: 1,
    selectedOrg: SAMPLE_ORGS[0],
  },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    docs: {
      description: { story: "Mobile menu expanded. Use the Hamburger button in the preview to toggle." },
    },
  },
};

// ── 7. Many notifications badge overflow ─────────────────────────────────────

export const ManyNotifications: Story = {
  name: "100+ unread notifications (badge overflow)",
  args: {
    walletAddress: WALLET_ADDRESS,
    globalApplicationCount: 0,
    unreadNotificationCount: 142,
    selectedOrg: SAMPLE_ORGS[2],
  },
  parameters: {
    docs: {
      description: { story: "Notification count > 99 displays as '99+' in the badge." },
    },
  },
};

// ── 8. No organisations ───────────────────────────────────────────────────────

export const NoOrgs: Story = {
  name: "No recent organizations",
  args: {
    walletAddress: WALLET_ADDRESS,
    globalApplicationCount: 0,
    unreadNotificationCount: 0,
    selectedOrg: null,
    recentOrgs: [],
  },
  parameters: {
    docs: {
      description: { story: "Org switcher dropdown shows 'No organizations found'." },
    },
  },
};
