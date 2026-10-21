import type { Meta, StoryObj } from "@storybook/react";
import { AuditLogPage, AuditLogRecord } from "../pages/AuditLogPage";

const SAMPLE_LOGS: AuditLogRecord[] = [
  {
    id: "log-1",
    timestamp: "2026-09-25T14:32:00Z",
    actor: "GBXXX1ABCDEFGHIJKLMNO12345",
    action: "org.cap.update",
    target: "stellar-org",
    diff: "- max_assignments: 4\n+ max_assignments: 6\n- global_cap: 10\n+ global_cap: 12",
    status: "success",
  },
  {
    id: "log-2",
    timestamp: "2026-09-25T15:10:12Z",
    actor: "GCYYY2PQRSTUVWXYZABCDE67890",
    action: "maintainer.register",
    target: "meridian-dao",
    diff: '+ maintainer: "GCYYY2PQRSTUVWXYZABCDE67890"\n+ role: "admin"',
    status: "success",
  },
  {
    id: "log-3",
    timestamp: "2026-09-25T16:04:45Z",
    actor: "GAZZZ3FGHIJKLMNOPQRST11111",
    action: "assignment.revoke",
    target: "issue #142",
    diff: '- status: "assigned"\n- assignee: "GAZZZ3FGHIJKLMNOPQRST11111"\n+ status: "open"\n+ reason: "TTL expired"',
    status: "failure",
  },
  {
    id: "log-4",
    timestamp: "2026-09-25T17:22:30Z",
    actor: "GDWWW4LMNOPQRSTUVWXYZ22222",
    action: "org.whitelist.add",
    target: "soroban-labs",
    diff: '+ allowed_tokens: ["XLM", "USDC"]',
    status: "pending",
  },
];

const meta: Meta<typeof AuditLogPage> = {
  title: "Pages/AuditLogPage",
  component: AuditLogPage,
  parameters: {
    docs: {
      description: {
        component:
          "Responsive audit log viewer. Displays a 6-column table on desktop (> 768px) and a stacked card layout on mobile (<= 768px).",
      },
    },
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof AuditLogPage>;

/** Default desktop layout with 6-column table */
export const DesktopTable: Story = {
  args: {
    initialLogs: SAMPLE_LOGS,
  },
  parameters: {
    viewport: {
      defaultViewport: "desktop",
    },
  },
};

/** Mobile card view demonstrating stacked cards layout on screens <= 768px */
export const MobileCardLayout: Story = {
  args: {
    initialLogs: SAMPLE_LOGS,
  },
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
};

/** Tablet viewport (768px) */
export const TabletView: Story = {
  args: {
    initialLogs: SAMPLE_LOGS,
  },
  parameters: {
    viewport: {
      defaultViewport: "tablet",
    },
  },
};

/** Empty audit log state */
export const Empty: Story = {
  args: {
    initialLogs: [],
  },
};
