import React from 'react'
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

/**
 * Renders all 5 semantic variants side-by-side.
 * Used as a Chromatic visual regression baseline for both dark mode and light mode.
 * Token-driven colours from tokens.css ensure dark/light rendering is correct.
 */
export const AllVariants: Story = {
  name: 'All Variants',
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="neutral">Neutral</Badge>
    </div>
  ),
}
