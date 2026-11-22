/**
 * Complete Card stories for the design system.
 * Covers default, with header, with footer, and dark-mode variants.
 *
 * Closes #541
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';

const meta: Meta<typeof Card> = {
  title: 'Design System/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Card>;

// ── Structural variants ───────────────────────────────────────────────────────

/** Minimal card — body content only, no header or footer. */
export const Default: Story = {
  args: {
    children: 'A simple card with no header or footer.',
  },
};

/** Card with a title header. */
export const WithHeader: Story = {
  args: {
    title: 'Contributor Profile',
    children: 'This contributor has 3 active assignments across 2 organisations.',
  },
};

/** Card with title, body, and footer actions. */
export const WithFooter: Story = {
  args: {
    title: 'Issue Assignment',
    children: <p>Fix TTL extension bug — the ledger closes before the TTL is bumped.</p>,
    footer: (
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-primary btn-sm">Assign</button>
        <button className="btn btn-ghost btn-sm">Dismiss</button>
      </div>
    ),
  },
};

/** Card containing a badge and supplementary metadata. */
export const WithBadge: Story = {
  render: () => (
    <Card
      title="Application #42"
      footer={
        <button className="btn btn-secondary btn-sm">View details</button>
      }
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Badge variant="info">Pending</Badge>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
          Applied 2026-06-20 · stellar-org
        </span>
      </div>
    </Card>
  ),
};

/** Card with long body text to verify padding and overflow. */
export const LongBody: Story = {
  args: {
    title: 'Governance Proposal',
    children: (
      <p>
        This proposal requests an increase to the org assignment cap for
        meridian-dao from 4 to 6. Justification: the organisation has
        consistently more available issues than contributors can claim under
        the current cap, resulting in frequent OrgAssignmentLimitReached
        errors (error code 7). Three maintainers have approved. Awaiting
        quorum.
      </p>
    ),
    footer: (
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-primary btn-sm">Approve</button>
        <button className="btn btn-revoke btn-sm">Reject</button>
      </div>
    ),
  },
};

// ── Dark-mode snapshots ───────────────────────────────────────────────────────

export const WithFooterDark: Story = {
  name: 'With footer (dark)',
  args: {
    title: 'Issue Assignment',
    children: <p>Fix TTL extension bug — the ledger closes before the TTL is bumped.</p>,
    footer: (
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-primary btn-sm">Assign</button>
        <button className="btn btn-ghost btn-sm">Dismiss</button>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <div data-theme="dark" style={{ background: '#0f1117', padding: '24px' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};

export const WithBadgeDark: Story = {
  name: 'With badge (dark)',
  render: () => (
    <div data-theme="dark" style={{ background: '#0f1117', padding: '24px' }}>
      <Card
        title="Application #42"
        footer={
          <button className="btn btn-secondary btn-sm">View details</button>
        }
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Badge variant="info">Pending</Badge>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            Applied 2026-06-20 · stellar-org
          </span>
        </div>
      </Card>
    </div>
  ),
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};
