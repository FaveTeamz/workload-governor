/**
 * Complete Gauge stories for the design system.
 * Covers 0%, 50%, 100%, and over-cap states.
 * Dark-mode variants included.
 *
 * Closes #541
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Gauge } from '../components/Gauge';

const meta: Meta<typeof Gauge> = {
  title: 'Design System/Gauge',
  component: Gauge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 15, step: 1 } },
    max: { control: { type: 'range', min: 1, max: 15, step: 1 } },
    size: { control: { type: 'range', min: 60, max: 400, step: 10 } },
    variant: { control: 'radio', options: ['global', 'org'] },
  },
};

export default meta;
type Story = StoryObj<typeof Gauge>;

// ── Threshold states ─────────────────────────────────────────────────────────

/** Empty — 0 of 15 slots used (green zone) */
export const Empty: Story = {
  name: '0% — Empty',
  args: { value: 0, max: 15, label: 'Global Applications', variant: 'global' },
};

/** ~50% — 7 of 15 (green zone ≤50%) */
export const HalfFull: Story = {
  name: '50% — Half full',
  args: { value: 7, max: 15, label: 'Global Applications', variant: 'global' },
};

/** ~60% — 9 of 15 (amber zone 51-80%) */
export const MediumUsage: Story = {
  name: '60% — Medium usage (amber)',
  args: { value: 9, max: 15, label: 'Global Applications', variant: 'global' },
};

/** ~87% — 13 of 15 (red zone >80%) */
export const HighUsage: Story = {
  name: '87% — High usage (red)',
  args: { value: 13, max: 15, label: 'Global Applications', variant: 'global' },
};

/** 100% — 15 of 15 (cap reached) */
export const AtCap: Story = {
  name: '100% — At cap',
  args: { value: 15, max: 15, label: 'Global cap reached', variant: 'global' },
};

// ── Org variant ───────────────────────────────────────────────────────────────

/** Org cap — 2 of 4 (50%, green) */
export const OrgHalfFull: Story = {
  name: 'Org — 50%',
  args: { value: 2, max: 4, label: 'Org: stellar-org', variant: 'org' },
};

/** Org cap — 4 of 4 (100%, red) */
export const OrgAtCap: Story = {
  name: 'Org — at cap',
  args: { value: 4, max: 4, label: 'Org: stellar-org', variant: 'org' },
};

// ── Size variants ────────────────────────────────────────────────────────────

export const SizeSmall: Story = {
  name: 'Small (200px)',
  args: { value: 8, max: 15, label: 'Applications', size: 200 },
};

export const SizeLarge: Story = {
  name: 'Large (400px)',
  args: { value: 8, max: 15, label: 'Applications', size: 400 },
};

// ── All thresholds grid ───────────────────────────────────────────────────────

export const AllThresholds: Story = {
  name: 'All thresholds',
  render: () => (
    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <Gauge value={0} max={15} label="Empty" />
      <Gauge value={3} max={15} label="Low (3/15)" />
      <Gauge value={9} max={15} label="Medium (9/15)" />
      <Gauge value={13} max={15} label="High (13/15)" />
      <Gauge value={15} max={15} label="Full (15/15)" />
    </div>
  ),
};

// ── Dark-mode snapshots ───────────────────────────────────────────────────────

export const AllThresholdsDark: Story = {
  name: 'All thresholds (dark)',
  render: () => (
    <div
      data-theme="dark"
      style={{
        background: '#0f1117',
        padding: '24px',
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}
    >
      <Gauge value={0} max={15} label="Empty" />
      <Gauge value={3} max={15} label="Low (3/15)" />
      <Gauge value={9} max={15} label="Medium (9/15)" />
      <Gauge value={13} max={15} label="High (13/15)" />
      <Gauge value={15} max={15} label="Full (15/15)" />
    </div>
  ),
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};

export const EmptyDark: Story = {
  name: '0% — Empty (dark)',
  args: { value: 0, max: 15, label: 'Global Applications', variant: 'global' },
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

export const AtCapDark: Story = {
  name: '100% — At cap (dark)',
  args: { value: 15, max: 15, label: 'Global cap reached', variant: 'global' },
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
