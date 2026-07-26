import type { Meta, StoryObj } from '@storybook/react'
import { Gauge } from '../components/Gauge'

const meta: Meta<typeof Gauge> = {
  title:     'Design System/Gauge',
  component: Gauge,
  tags:      ['autodocs'],
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 15, step: 1 } },
    max:   { control: { type: 'range', min: 1, max: 15, step: 1 } },
    size:  { control: { type: 'range', min: 60, max: 200, step: 10 } },
  },
}
export default meta
type Story = StoryObj<typeof Gauge>

export const Low: Story      = { args: { value: 3,  max: 15, label: 'Global applications' } }
export const Medium: Story   = { args: { value: 10, max: 15, label: 'Global applications' } }
export const High: Story     = { args: { value: 14, max: 15, label: 'Global applications' } }
export const OrgSlot: Story  = { args: { value: 2,  max: 4,  label: 'Org: stellar'        } }
export const Playground: Story = {
  args: { value: 7, max: 15, label: 'Custom', size: 120 },
}
