import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../components/Button'

const meta: Meta<typeof Button> = {
  title:     'Design System/Button',
  component: Button,
  tags:      ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost'] },
    size:    { control: 'select', options: ['sm', 'md'] },
    disabled:{ control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story   = { args: { variant: 'primary',   children: 'Primary' } }
export const Secondary: Story = { args: { variant: 'secondary', children: 'Secondary' } }
export const Ghost: Story     = { args: { variant: 'ghost',     children: 'Ghost' } }
export const Small: Story     = { args: { variant: 'primary',   children: 'Small', size: 'sm' } }
export const Disabled: Story  = { args: { variant: 'primary',   children: 'Disabled', disabled: true } }
