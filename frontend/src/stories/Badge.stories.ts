import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from '../components/Badge'

const meta: Meta<typeof Badge> = {
  title:     'Design System/Badge',
  component: Badge,
  tags:      ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['success', 'warning', 'error', 'info', 'neutral'] },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Success: Story = { args: { variant: 'success', children: 'Success' } }
export const Warning: Story = { args: { variant: 'warning', children: 'Warning' } }
export const Error: Story   = { args: { variant: 'error',   children: 'Error'   } }
export const Info: Story    = { args: { variant: 'info',    children: 'Info'    } }
export const Neutral: Story = { args: { variant: 'neutral', children: 'Neutral' } }
