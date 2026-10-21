/**
 * Complete Button stories for the design system.
 * Covers primary, secondary, ghost, disabled, loading variants.
 * Dark-mode variants via Storybook decorator.
 *
 * Closes #541
 */
import type { Meta, StoryObj } from '@storybook/react';

interface ButtonProps {
  label: string;
  variant: 'primary' | 'secondary' | 'ghost' | 'complete' | 'revoke';
  size: 'default' | 'sm';
  disabled: boolean;
  loading: boolean;
  onClick?: () => void;
}

function Button({ label, variant, size, disabled, loading, onClick }: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading} onClick={onClick}>
      {loading ? 'Loading…' : label}
    </button>
  );
}

const meta: Meta<ButtonProps> = {
  title: 'Design System/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'complete', 'revoke'],
    },
    size: { control: 'select', options: ['default', 'sm'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    label: { control: 'text' },
    onClick: { action: 'clicked' },
  },
  args: {
    label: 'Button',
    variant: 'primary',
    size: 'default',
    disabled: false,
    loading: false,
  },
};

export default meta;
type Story = StoryObj<ButtonProps>;

// ── Variant stories ──────────────────────────────────────────────────────────

export const Primary: Story = {
  args: { label: 'Primary', variant: 'primary' },
};

export const Secondary: Story = {
  args: { label: 'Secondary', variant: 'secondary' },
};

/** Minimal treatment, used inline or in toolbars. */
export const Ghost: Story = {
  args: { label: 'Ghost', variant: 'ghost' },
};

export const Complete: Story = {
  name: 'Complete (success action)',
  args: { label: 'Complete', variant: 'complete' },
};

export const Revoke: Story = {
  name: 'Revoke (destructive action)',
  args: { label: 'Revoke', variant: 'revoke' },
};

// ── State stories ─────────────────────────────────────────────────────────────

export const Small: Story = {
  name: 'Small size',
  args: { label: 'Small', variant: 'primary', size: 'sm' },
};

export const Disabled: Story = {
  args: { label: 'Disabled', variant: 'primary', disabled: true },
};

export const Loading: Story = {
  args: { label: 'Loading', variant: 'primary', loading: true },
};

// ── All variants side-by-side ────────────────────────────────────────────────

export const AllVariants: Story = {
  name: 'All variants',
  render: () => (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-primary">Primary</button>
      <button className="btn btn-secondary">Secondary</button>
      <button className="btn btn-ghost">Ghost</button>
      <button className="btn btn-complete">Complete</button>
      <button className="btn btn-revoke">Revoke</button>
      <button className="btn btn-primary" disabled>Disabled</button>
      <button className="btn btn-primary btn-sm">Small</button>
    </div>
  ),
};

// ── Dark-mode variants ────────────────────────────────────────────────────────

export const AllVariantsDark: Story = {
  name: 'All variants (dark)',
  render: () => (
    <div
      data-theme="dark"
      style={{
        background: 'var(--ds-bg, #0f1117)',
        padding: '24px',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <button className="btn btn-primary">Primary</button>
      <button className="btn btn-secondary">Secondary</button>
      <button className="btn btn-ghost">Ghost</button>
      <button className="btn btn-complete">Complete</button>
      <button className="btn btn-revoke">Revoke</button>
      <button className="btn btn-primary" disabled>Disabled</button>
      <button className="btn btn-primary btn-sm">Small</button>
    </div>
  ),
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};

export const PrimaryDark: Story = {
  name: 'Primary (dark)',
  args: { label: 'Primary', variant: 'primary' },
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

export const SecondaryDark: Story = {
  name: 'Secondary (dark)',
  args: { label: 'Secondary', variant: 'secondary' },
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

export const GhostDark: Story = {
  name: 'Ghost (dark)',
  args: { label: 'Ghost', variant: 'ghost' },
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
