/**
 * Gauge stories — closes #279
 *
 * Maps to CapacityBars, which renders progress bars (gauges) for global and
 * per-org caps.  Covers: empty (0%), 25%, 50%, 75%, full (100%) for both
 * the global (cap=15) and org (cap=4) variants.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { CapacityBars } from '../components/CapacityBars';
import type { OrgCount } from '../components/CapacityBars';

// ── Meta ──────────────────────────────────────────────────────────────────────

interface GaugeArgs {
  globalApplications: number;
  orgCounts:          OrgCount[];
}

const meta: Meta<GaugeArgs> = {
  title:     'Design System/Gauge',
  component: CapacityBars,
  tags:      ['autodocs'],
  argTypes: {
    globalApplications: {
      control: { type: 'range', min: 0, max: 15, step: 1 },
      description: 'Global pending applications (cap: 15)',
    },
    orgCounts: {
      control: 'object',
      description: 'Per-org assignment counts (cap: 4 each)',
    },
  },
  args: {
    globalApplications: 0,
    orgCounts: [{ org: 'stellar-org', assignments: 0 }],
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '480px', padding: '24px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<GaugeArgs>;

// ── Global gauge fill stories ─────────────────────────────────────────────────

export const GlobalEmpty: Story = {
  name: 'Global — 0% (empty)',
  args: { globalApplications: 0, orgCounts: [] },
};

export const Global25: Story = {
  name: 'Global — 25% (3/15)',
  args: { globalApplications: 3, orgCounts: [] },
};

export const Global50: Story = {
  name: 'Global — 50% (7/15)',
  args: { globalApplications: 7, orgCounts: [] },
};

export const Global75: Story = {
  name: 'Global — 75% (11/15) warning',
  args: { globalApplications: 11, orgCounts: [] },
};

export const GlobalFull: Story = {
  name: 'Global — 100% (15/15) critical',
  args: { globalApplications: 15, orgCounts: [] },
};

// ── Org gauge fill stories ────────────────────────────────────────────────────

export const OrgEmpty: Story = {
  name: 'Org — 0% (empty)',
  args: {
    globalApplications: 0,
    orgCounts: [{ org: 'stellar-org', assignments: 0 }],
  },
};

export const Org25: Story = {
  name: 'Org — 25% (1/4)',
  args: {
    globalApplications: 1,
    orgCounts: [{ org: 'stellar-org', assignments: 1 }],
  },
};

export const Org50: Story = {
  name: 'Org — 50% (2/4)',
  args: {
    globalApplications: 2,
    orgCounts: [{ org: 'stellar-org', assignments: 2 }],
  },
};

export const Org75: Story = {
  name: 'Org — 75% (3/4) warning',
  args: {
    globalApplications: 3,
    orgCounts: [{ org: 'stellar-org', assignments: 3 }],
  },
};

export const OrgFull: Story = {
  name: 'Org — 100% (4/4) critical',
  args: {
    globalApplications: 4,
    orgCounts: [{ org: 'stellar-org', assignments: 4 }],
  },
};

// ── Multi-org story ───────────────────────────────────────────────────────────

export const MultiOrg: Story = {
  name: 'Multi-org overview',
  args: {
    globalApplications: 8,
    orgCounts: [
      { org: 'stellar-org',  assignments: 3 },
      { org: 'meridian-dao', assignments: 1 },
      { org: 'soroban-labs', assignments: 0 },
    ],
  },
};

// ── Interactive slider ────────────────────────────────────────────────────────

export const Interactive: Story = {
  name: 'Interactive (use controls panel)',
  args: {
    globalApplications: 5,
    orgCounts: [
      { org: 'stellar-org', assignments: 2 },
    ],
  },
};
