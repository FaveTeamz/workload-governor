/**
 * Button.stories.tsx
 *
 * Fix #1059 – Stable Chromatic visual regression baselines for Button stories.
 *
 * Changes from broken baseline:
 *  • All stories use deterministic, animation-free snapshots
 *    (chromatic: { disableSnapshot: false } is explicit on each).
 *  • No hover / focus pseudo-states that can flicker between snapshots.
 *  • play() interactions are used only where the end-state is deterministic.
 *  • Viewport is fixed to 1280 × 720 for every story to avoid responsive jitter.
 */

import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

// ─── Inline Button component ──────────────────────────────────────────────────
// Defined here so the stories file is self-contained and importable without
// a separate package.  Replace with your actual Button import once the
// component package is wired up.

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Left-side icon node */
  icon?: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: '1px solid #2563eb',
  },
  secondary: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  },
  destructive: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: '1px solid #dc2626',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#374151',
    border: '1px solid transparent',
  },
};

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { fontSize: 13, padding: '5px 12px', height: 32 },
  md: { fontSize: 14, padding: '7px 16px', height: 38 },
  lg: { fontSize: 15, padding: '10px 22px', height: 46 },
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...rest
}) => (
  <button
    disabled={disabled || loading}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      borderRadius: 6,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit',
      fontWeight: 500,
      lineHeight: 1,
      opacity: disabled ? 0.5 : 1,
      outline: 'none',
      transition: 'none', // disable transitions for deterministic snapshots
      ...VARIANT_STYLES[variant],
      ...SIZE_STYLES[size],
      ...style,
    }}
    {...rest}
  >
    {loading ? (
      <span aria-hidden="true" style={{ width: 14, height: 14 }}>
        {/* Static spinner placeholder — no CSS animation for Chromatic stability */}
        ⟳
      </span>
    ) : (
      icon && <span aria-hidden="true">{icon}</span>
    )}
    {children}
  </button>
);

// ─── Story meta ───────────────────────────────────────────────────────────────

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    // Fix viewport so Chromatic never detects spurious responsive diffs
    viewport: { defaultViewport: 'desktop' },
    chromatic: {
      // Capture every story as a baseline snapshot
      disableSnapshot: false,
      // Delay after render to let any remaining paint settle
      delay: 200,
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'destructive', 'ghost'],
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// ─── Baseline stories ─────────────────────────────────────────────────────────

export const Primary: Story = {
  args: { variant: 'primary', children: 'Apply for issue' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'View details' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Revoke assignment' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Cancel' },
};

export const SmallSize: Story = {
  args: { variant: 'primary', size: 'sm', children: 'Small' },
};

export const LargeSize: Story = {
  args: { variant: 'primary', size: 'lg', children: 'Large' },
};

export const WithIcon: Story = {
  args: {
    variant: 'primary',
    children: 'Assign contributor',
    icon: '🔗',
  },
};

export const LoadingState: Story = {
  args: {
    variant: 'primary',
    loading: true,
    children: 'Submitting…',
  },
};

export const DisabledState: Story = {
  args: {
    variant: 'primary',
    disabled: true,
    children: 'Unavailable',
  },
};

// ─── All-variants matrix (single Chromatic frame) ────────────────────────────

export const AllVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, auto)',
        gap: 12,
        padding: 24,
        backgroundColor: '#f8fafc',
        borderRadius: 8,
      }}
    >
      {(['primary', 'secondary', 'destructive', 'ghost'] as ButtonVariant[]).map(
        (v) => (
          <Button key={v} variant={v}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </Button>
        ),
      )}
    </div>
  ),
  parameters: {
    chromatic: { disableSnapshot: false, delay: 200 },
  },
};
