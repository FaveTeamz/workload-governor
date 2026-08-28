/**
 * Modal stories — closes #279
 *
 * Uses OnboardingWizard as the primary modal pattern, plus a raw ShortcutHelpModal.
 * Covers: open, closed, loading (with spinner overlay), error states.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ShortcutHelpModal } from '../components/ShortcutHelpModal';

// ─── Generic modal wrapper for storybook controls ────────────────────────────

interface ModalDemoProps {
  open:    boolean;
  title:   string;
  loading: boolean;
  error:   boolean;
}

function ModalDemo({ open, title, loading, error }: ModalDemoProps) {
  const [localOpen, setLocalOpen] = useState(open);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setLocalOpen(true)}>
        Open Modal
      </button>

      {localOpen && (
        <div
          className="onboarding-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onKeyDown={(e) => e.key === 'Escape' && setLocalOpen(false)}
        >
          <div
            className="onboarding-dialog"
            style={{ minHeight: '200px', justifyContent: 'center' }}
          >
            <button
              className="onboarding-close"
              onClick={() => setLocalOpen(false)}
              aria-label="Close modal"
            >
              ✕
            </button>

            <h2>{title}</h2>

            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '16px 0' }}>
                <div
                  aria-label="Loading…"
                  role="status"
                  style={{
                    width:  '36px',
                    height: '36px',
                    border: '3px solid var(--color-border)',
                    borderTopColor: 'var(--color-primary)',
                    borderRadius:   '50%',
                    animation: 'spin .7s linear infinite',
                  }}
                />
                <p style={{ color: 'var(--color-muted)' }}>Loading…</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  background:   'var(--color-error-900, #7f1d1d)',
                  border:       '1px solid var(--color-error-500)',
                  borderRadius: 'var(--radius)',
                  padding:      '12px 16px',
                  color:        'var(--color-error-100, #fee2e2)',
                  fontSize:     'var(--text-sm)',
                }}
              >
                ⚠ Something went wrong. Please try again.
              </div>
            )}

            {!loading && !error && (
              <p style={{ color: 'var(--color-muted)' }}>Modal content goes here.</p>
            )}

            <div className="onboarding-actions">
              <button
                className="btn btn-primary"
                onClick={() => setLocalOpen(false)}
                disabled={loading}
              >
                Confirm
              </button>
              <button className="btn btn-ghost" onClick={() => setLocalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const meta: Meta<ModalDemoProps> = {
  title:     'Design System/Modal',
  component: ModalDemo,
  tags:      ['autodocs'],
  argTypes: {
    open:    { control: 'boolean', description: 'Initial open state' },
    title:   { control: 'text' },
    loading: { control: 'boolean', description: 'Show loading spinner inside modal' },
    error:   { control: 'boolean', description: 'Show error state inside modal' },
  },
  args: {
    open:    false,
    title:   'Confirm Action',
    loading: false,
    error:   false,
  },
  decorators: [
    (Story) => (
      <div style={{ padding: '32px', minHeight: '200px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<ModalDemoProps>;

// ── Modal state stories ───────────────────────────────────────────────────────

export const Closed: Story = {
  name: 'Closed (trigger visible)',
  args: { open: false },
};

export const Open: Story = {
  name: 'Open — default content',
  args: { open: true, title: 'Confirm Action' },
};

export const LoadingState: Story = {
  name: 'Open — loading',
  args: { open: true, title: 'Processing…', loading: true },
};

export const ErrorState: Story = {
  name: 'Open — error',
  args: { open: true, title: 'Action Failed', error: true },
};

// ── Shortcut Help Modal ───────────────────────────────────────────────────────

export const ShortcutModal: Story = {
  name: 'Shortcut help modal',
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: '32px' }}>
        <button className="btn btn-secondary" onClick={() => setOpen(true)}>
          Open Shortcut Help (or press ?)
        </button>
        <ShortcutHelpModal open={open} onClose={() => setOpen(false)} />
      </div>
    );
  },
};
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'

const meta: Meta<typeof Modal> = {
  title:     'Design System/Modal',
  component: Modal,
  tags:      ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Modal>

function ModalDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <Modal
        open={open}
        title="Confirm Action"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost"     onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary"   onClick={() => setOpen(false)}>Confirm</Button>
          </>
        }
      >
        Are you sure you want to proceed with this action?
      </Modal>
    </>
  )
}

export const Default: Story = { render: () => <ModalDemo /> }
