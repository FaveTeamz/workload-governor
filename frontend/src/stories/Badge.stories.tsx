/**
 * Badge stories — closes #279
 *
 * Semantic variants: success, warning, error, info, neutral
 * Covers the chip/badge patterns used in IssueCard and MaintainerPanel.
 */
import type { Meta, StoryObj } from '@storybook/react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  label:   string;
  variant: BadgeVariant;
  size:    'default' | 'sm';
}

const VARIANT_STYLE: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'color-mix(in srgb, var(--color-success-500) 20%, transparent)', color: 'var(--color-success-500)' },
  warning: { background: 'color-mix(in srgb, var(--color-warning-500) 20%, transparent)', color: 'var(--color-warning-500)' },
  error:   { background: 'color-mix(in srgb, var(--color-error-500)   20%, transparent)', color: 'var(--color-error-500)'   },
  info:    { background: 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-500)' },
  neutral: { background: 'color-mix(in srgb, var(--color-muted)       20%, transparent)', color: 'var(--color-muted)'       },
};

function Badge({ label, variant, size }: BadgeProps) {
  const baseStyle: React.CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    padding:      size === 'sm' ? '2px 8px' : '4px 12px',
    borderRadius: 'var(--radius-full)',
    fontSize:     size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
    fontWeight:   'var(--font-semibold)',
    whiteSpace:   'nowrap',
    ...VARIANT_STYLE[variant],
  };

  return (
    <span style={baseStyle} aria-label={`${variant} badge: ${label}`}>
      {label}
    </span>
  );
}

const meta: Meta<BadgeProps> = {
  title:     'Design System/Badge',
  component: Badge,
  tags:      ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'warning', 'error', 'info', 'neutral'],
      description: 'Semantic colour variant',
    },
    size: {
      control: 'select',
      options: ['default', 'sm'],
    },
    label: { control: 'text' },
  },
  args: {
    label:   'Status',
    variant: 'success',
    size:    'default',
  },
};

export default meta;
type Story = StoryObj<BadgeProps>;

// ── Semantic variant stories ─────────────────────────────────────────────────

export const Success: Story = {
  args: { label: 'Open', variant: 'success' },
};

export const Warning: Story = {
  args: { label: 'Applied', variant: 'warning' },
};

export const Error: Story = {
  args: { label: 'Revoked', variant: 'error' },
};

export const Info: Story = {
  args: { label: 'Assigned', variant: 'info' },
};

export const Neutral: Story = {
  args: { label: 'Completed', variant: 'neutral' },
};

// ── Size variant ─────────────────────────────────────────────────────────────

export const SmallBadge: Story = {
  name: 'Small badge',
  args: { label: 'Open', variant: 'success', size: 'sm' },
};

// ── All variants side-by-side ────────────────────────────────────────────────

export const AllVariants: Story = {
  name: 'All variants',
  render: () => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      {(['success', 'warning', 'error', 'info', 'neutral'] as BadgeVariant[]).map((v) => (
        <Badge key={v} label={v} variant={v} size="default" />
      ))}
    </div>
  ),
};

// ── IssueCard chip examples ───────────────────────────────────────────────────

export const IssueStatusChips: Story = {
  name: 'Issue status chips',
  render: () => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="issue-card__chip issue-card__chip--open">Open</span>
      <span className="issue-card__chip issue-card__chip--applied">Applied</span>
      <span className="issue-card__chip issue-card__chip--assigned">Assigned</span>
      <span className="issue-card__chip issue-card__chip--completed">Completed</span>
    </div>
  ),
};
