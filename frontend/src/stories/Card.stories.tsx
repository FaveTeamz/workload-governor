/**
 * Card stories — closes #279
 *
 * Maps to IssueCard, which is the primary "card" component in the design system.
 * Covers: default, hover (CSS), selected, all status states, skeleton loading.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { IssueCard } from '../components/IssueCard';
import type { IssueStatus } from '../components/IssueCard';

const meta: Meta<typeof IssueCard> = {
  title:     'Design System/Card',
  component: IssueCard,
  tags:      ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['open', 'applied', 'assigned', 'completed'],
      description: 'Current status of the issue',
    },
    org:    { control: 'text',   description: 'Organisation name' },
    title:  { control: 'text',   description: 'Issue title' },
    onApply:    { action: 'apply' },
    onWithdraw: { action: 'withdraw' },
  },
  args: {
    id:     '123',
    org:    'stellar-org',
    title:  'Fix TTL extension bug in apply_for_issue',
    status: 'open',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '480px', padding: '16px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof IssueCard>;

// ── Status state stories ─────────────────────────────────────────────────────

export const OpenIssue: Story = {
  name: 'Open — can apply',
  args: { status: 'open' },
};

export const AppliedIssue: Story = {
  name: 'Applied — can withdraw',
  args: { status: 'applied' },
};

export const AssignedIssue: Story = {
  name: 'Assigned — no action',
  args: { status: 'assigned' },
};

export const CompletedIssue: Story = {
  name: 'Completed — read-only',
  args: { status: 'completed' },
};

// ── Long title truncation ─────────────────────────────────────────────────────

export const LongTitle: Story = {
  name: 'Long title (overflow)',
  args: {
    title: 'Refactor the storage layout to reduce key collision probability in multi-org scenarios with very long contributor keys',
    status: 'open',
  },
};

// ── Skeleton loading state (CSS-only) ────────────────────────────────────────

export const Skeleton: Story = {
  name: 'Skeleton loading state',
  render: () => (
    <div style={{ maxWidth: '480px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="issue-card"
          aria-hidden="true"
          style={{
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '8px',
          }}>
            <div style={skeletonBar(80, 18)} />
            <div style={skeletonBar(60, 18)} />
          </div>
          <div style={skeletonBar('100%', 16)} />
          <div style={{ ...skeletonBar('60%', 16), marginTop: '4px' }} />
          <div style={{ ...skeletonBar(80, 30), marginTop: '8px' }} />
        </div>
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .4; }
        }
      `}</style>
    </div>
  ),
};

function skeletonBar(width: number | string, height: number): React.CSSProperties {
  return {
    width:        typeof width === 'number' ? `${width}px` : width,
    height:       `${height}px`,
    borderRadius: 'var(--radius)',
    background:   'var(--color-border)',
  };
}

// ── All statuses side-by-side ─────────────────────────────────────────────────

export const AllStatuses: Story = {
  name: 'All statuses',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '480px', padding: '16px' }}>
      {(['open', 'applied', 'assigned', 'completed'] as IssueStatus[]).map((s) => (
        <IssueCard
          key={s}
          id={s}
          org="stellar-org"
          title={`Example issue — status: ${s}`}
          status={s}
        />
      ))}
    </div>
  ),
};
