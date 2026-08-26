import type { Meta, StoryObj } from '@storybook/react'
import { ErrorState } from '../components/ErrorState'
import '../app.css'

const meta: Meta<typeof ErrorState> = {
  title:     'Design System/ErrorState',
  component: ErrorState,
  tags:      ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark', values: [{ name: 'dark', value: '#0f1117' }] },
  },
}
export default meta
type Story = StoryObj<typeof ErrorState>

export const NotFound: Story = {
  name: '404 — Page not found',
  render: () => (
    <ErrorState
      variant="not-found"
      ctaLabel="Go to dashboard"
      onCta={() => alert('Navigate home')}
    />
  ),
}

export const Forbidden: Story = {
  name: '403 — Access denied',
  render: () => (
    <ErrorState
      variant="forbidden"
      ctaLabel="Go to dashboard"
      onCta={() => alert('Navigate home')}
    />
  ),
}

export const ServerError: Story = {
  name: '500 — Server error',
  render: () => (
    <ErrorState
      variant="server-error"
      onRetry={() => alert('Retrying…')}
      ctaLabel="Go to dashboard"
      onCta={() => alert('Navigate home')}
    />
  ),
}

export const GenericWithRetry: Story = {
  name: 'Generic error with retry',
  render: () => (
    <ErrorState
      variant="generic"
      onRetry={() => alert('Retrying…')}
    />
  ),
}

export const CustomMessage: Story = {
  name: 'Custom title & message',
  render: () => (
    <ErrorState
      variant="server-error"
      title="Failed to load events"
      message="The activity feed couldn't be fetched. Check your connection and try again."
      onRetry={() => alert('Retrying…')}
    />
  ),
}

export const NoCta: Story = {
  name: 'Error — no actions (display only)',
  render: () => (
    <ErrorState
      variant="not-found"
    />
  ),
}
