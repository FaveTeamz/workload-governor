import type { Meta, StoryObj } from '@storybook/react'
import { Card } from '../components/Card'

const meta: Meta<typeof Card> = {
  title:     'Design System/Card',
  component: Card,
  tags:      ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  args: {
    title:    'Card Title',
    children: 'Card body content goes here.',
    footer:   'Footer area',
  },
}

export const NoHeader: Story = {
  args: { children: 'A card with no header or footer.' },
}
