/**
 * Complete Modal stories for the design system.
 * Covers open/closed states, with footer, loading content, long content.
 * Dark-mode variants via inline wrapper.
 *
 * Closes #541
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ShortcutHelpModal } from '../components/ShortcutHelpModal';

// ── Controlled demo wrapper ───────────────────────────────────────────────────

interface ModalDemoProps {
  initialOpen: boolean;
  title: string;
  loading: boolean;
  error: boolean;
  longContent: boolean;
  dark: boolean;
}

function ModalDemo({ initialOpen, title, loading, error, longContent, dark }: ModalDemoProps) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <div
      data-theme={dark ? 'dark' : 'light'}
      style={{
        background: dark ? '#0f1117' : '#f8fafc',
        padding: '32px',
        minHeight: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        Open Modal
      </button>

      {open && (
        <div
          className="onboarding-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          <div className="onboarding-dialog" style={{ minHeight: '180px' }}>
            <button
              className="onboarding-close"
              onClick={() => setOpen(false)}
              aria-label="Close modal"
            >
              ✕
            </button>

            <h2>{title}</h2>

            {loading && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '24px 0',
                }}
              >
                <div
                  aria-label="Loading…"
                  role="status"
                  style={{
                    width: '36px',
                    height: '36px',
                    border: '3px solid var(--color-border)',
                    borderTopColor: 'var(--color-primary)',
                    borderRadius: '50%',
                    animation: 'spin .7s linear infinite',
                  }}
                />
                <p style={{ color: 'var(--color-muted)' }}>Loading…</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {error && !loading && (
              <div
                role="alert"
                style={{
                  background: 'var(--color-error-900, #7f1d1d)',
                  border: '1px solid var(--color-error-500)',
                  borderRadius: 'var(--radius)',
                  padding: '12px 16px',
                  color: 'var(--color-error-100, #fee2e2)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: '12px',
                }}
              >
                ⚠ Something went wrong. Please try again.
              </div>
            )}

            {!loading && !error && !longContent && (
              <p style={{ marginBottom: '16px' }}>
                Are you sure you want to perform this action? It cannot be undone.
              </p>
            )}

            {!loading && longContent && (
              <div style={{ maxHeight: '260px', overflowY: 'auto', marginBottom: '16px' }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <p key={i} style={{ marginBottom: '12px', fontSize: 'var(--text-sm)' }}>
                    Section {i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                    Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  </p>
                ))}
              </div>
            )}

            <div className="onboarding-actions">
              <button
                className="btn btn-primary"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Confirm
              </button>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<ModalDemoProps> = {
  title: 'Design System/Modal',
  component: ModalDemo,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    initialOpen: { control: 'boolean', description: 'Open modal on story load' },
    title: { control: 'text' },
    loading: { control: 'boolean' },
    error: { control: 'boolean' },
    longContent: { control: 'boolean' },
    dark: { control: 'boolean' },
  },
  args: {
    initialOpen: false,
    title: 'Confirm Action',
    loading: false,
    error: false,
    longContent: false,
    dark: false,
  },
};

export default meta;
type Story = StoryObj<ModalDemoProps>;

// ── Stories ───────────────────────────────────────────────────────────────────

/** Trigger button visible; modal closed. */
export const Closed: Story = {
  name: 'Closed state',
  args: { initialOpen: false },
};

/** Default content — confirm/cancel buttons. */
export const Open: Story = {
  name: 'Open — default',
  args: { initialOpen: true, title: 'Confirm Action' },
};

/** Loading spinner inside an open modal. */
export const LoadingState: Story = {
  name: 'Open — loading',
  args: { initialOpen: true, title: 'Processing…', loading: true },
};

/** Error alert inside an open modal. */
export const ErrorState: Story = {
  name: 'Open — error',
  args: { initialOpen: true, title: 'Action Failed', error: true },
};

/** Scrollable long content. */
export const LongContent: Story = {
  name: 'Open — long content (scrollable)',
  args: { initialOpen: true, title: 'Terms of Service', longContent: true },
};

// ── Dark-mode snapshots ───────────────────────────────────────────────────────

export const OpenDark: Story = {
  name: 'Open — dark mode',
  args: { initialOpen: true, title: 'Confirm Action', dark: true },
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};

export const LoadingDark: Story = {
  name: 'Loading — dark mode',
  args: { initialOpen: true, title: 'Processing…', loading: true, dark: true },
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};

// ── Shortcut help modal (real component) ─────────────────────────────────────

export const ShortcutModal: Story = {
  name: 'Shortcut help modal',
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: '32px' }}>
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          Open Shortcut Help
        </button>
        <ShortcutHelpModal open={open} onClose={() => setOpen(false)} />
      </div>
    );
  },
};
