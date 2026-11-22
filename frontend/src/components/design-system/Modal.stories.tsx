import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Modal } from "./Modal";
import { Button } from "./Button";

const meta = {
  title: "Design System/Modal",
  component: Modal,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Controlled wrapper for interactive stories ─────────────────
function ModalDemo({
  title,
  footer,
  children,
  dark = false,
}: {
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      data-theme={dark ? "dark" : "light"}
      style={{
        background: dark ? "var(--ds-bg, #0f1117)" : "var(--ds-bg, #fff)",
        minHeight: "300px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open Modal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={footer}
      >
        {children}
      </Modal>
    </div>
  );
}

// ── Stories ────────────────────────────────────────────────────

/** Basic modal with only content — no footer. */
export const Default: Story = {
  render: () => (
    <ModalDemo title="Confirm Action">
      <p>Are you sure you want to perform this action? It cannot be undone.</p>
    </ModalDemo>
  ),
};

/** Modal with footer action buttons. */
export const WithFooter: Story = {
  render: () => (
    <ModalDemo
      title="Assign Issue"
      footer={
        <>
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary">Confirm Assignment</Button>
        </>
      }
    >
      <p>
        You are about to assign <strong>"Fix TTL extension bug"</strong> to
        contributor <code>GBXXX1…</code>. This will count toward their org
        assignment cap.
      </p>
    </ModalDemo>
  ),
};

/** Modal with a longer body to verify scrolling. */
export const LongContent: Story = {
  render: () => (
    <ModalDemo
      title="Terms of Service"
      footer={
        <>
          <Button variant="ghost">Decline</Button>
          <Button variant="primary">Accept</Button>
        </>
      }
    >
      {Array.from({ length: 12 }, (_, i) => (
        <p key={i} style={{ marginBottom: "12px" }}>
          Section {i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing
          elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </p>
      ))}
    </ModalDemo>
  ),
};

// ── Dark-mode snapshots ─────────────────────────────────────────

export const DefaultDark: Story = {
  render: () => (
    <ModalDemo title="Confirm Action" dark>
      <p>Are you sure you want to perform this action? It cannot be undone.</p>
    </ModalDemo>
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};

export const WithFooterDark: Story = {
  render: () => (
    <ModalDemo
      title="Assign Issue"
      dark
      footer={
        <>
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary">Confirm Assignment</Button>
        </>
      }
    >
      <p>
        You are about to assign <strong>"Fix TTL extension bug"</strong> to
        contributor <code>GBXXX1…</code>. This will count toward their org
        assignment cap.
      </p>
    </ModalDemo>
  ),
  parameters: {
    themes: { themeOverride: "dark" },
    chromatic: { modes: { dark: { theme: "dark" } } },
  },
};
