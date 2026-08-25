import type { Meta, StoryObj } from '@storybook/react'
import { Gauge } from '../components/Gauge'

const meta: Meta<typeof Gauge> = {
  title:     'Design System/Gauge',
  component: Gauge,
  tags:      ['autodocs'],
  argTypes: {
    value:   { control: { type: 'range', min: 0, max: 15, step: 1 } },
    max:     { control: { type: 'range', min: 1, max: 15, step: 1 } },
    size:    { control: { type: 'range', min: 60, max: 400, step: 10 } },
    variant: { control: 'radio', options: ['global', 'org'] },
  },
}
export default meta
type Story = StoryObj<typeof Gauge>

// ── Global variant (0-15) ────────────────────────────────────

/** Empty — 0 of 15 slots used (green) */
export const GlobalEmpty: Story = {
  args: { value: 0, max: 15, label: 'Global Applications', variant: 'global' },
}

/** ~Half — 7 of 15 slots used (green, ≤50%) */
export const GlobalHalf: Story = {
  args: { value: 7, max: 15, label: 'Global Applications', variant: 'global' },
}

/** Yellow threshold — 9 of 15 = 60% (yellow, 51-80%) */
export const GlobalYellow: Story = {
  args: { value: 9, max: 15, label: 'Global Applications', variant: 'global' },
}

/** Red threshold — 13 of 15 = 87% (red, >80%) */
export const GlobalRed: Story = {
  args: { value: 13, max: 15, label: 'Global Applications', variant: 'global' },
}

/** Full — 15 of 15 (red, 100%) */
export const GlobalFull: Story = {
  args: { value: 15, max: 15, label: 'Global Applications', variant: 'global' },
}

// ── Org variant (0-4) ────────────────────────────────────────

/** ~Half org — 2 of 4 = 50% (green) */
export const OrgHalf: Story = {
  args: { value: 2, max: 4, label: 'Org: stellar-org', variant: 'org' },
}

/** Full org — 4 of 4 (red, 100%) */
export const OrgFull: Story = {
  args: { value: 4, max: 4, label: 'Org: stellar-org', variant: 'org' },
}

// ── With tooltip ─────────────────────────────────────────────

/** Tooltip shown on hover/focus */
export const WithTooltip: Story = {
  args: {
    value:   12,
    max:     15,
    label:   'Global Applications',
    variant: 'global',
    tooltip: 'You have used 12 of 15 global application slots.',
  },
}

// ── Responsive sizing ────────────────────────────────────────

/** Small (200px) */
export const SizeSmall: Story = {
  args: { value: 8, max: 15, label: 'Global Applications', size: 200 },
}

/** Large (400px) */
export const SizeLarge: Story = {
  args: { value: 8, max: 15, label: 'Global Applications', size: 400 },
}

// ── Playground ───────────────────────────────────────────────

export const Playground: Story = {
  args: { value: 7, max: 15, label: 'Custom', size: 120, variant: 'global' },
}
