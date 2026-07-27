import type { Meta, StoryObj } from '@storybook/react'
import { EmptyState } from '../components/EmptyState'
import '../app.css'

const meta: Meta<typeof EmptyState> = {
  title:     'Design System/EmptyState',
  component: EmptyState,
  tags:      ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark', values: [{ name: 'dark', value: '#0f1117' }] },
  },
}
export default meta
type Story = StoryObj<typeof EmptyState>

// --- Full illustrated variants ---

export const NoDashboardOrgs: Story = {
  name: 'Dashboard — No orgs',
  render: () => (
    <EmptyState
      variant="no-orgs"
      ctaLabel="Browse organisations"
      onCta={() => alert('Navigate to org browser')}
    />
  ),
}

export const NoIssues: Story = {
  name: 'Issues — No open issues',
  render: () => (
    <EmptyState
      variant="no-issues"
      ctaLabel="Open GitHub issues"
      onCta={() => alert('Open GitHub')}
    />
  ),
}

export const NoApplications: Story = {
  name: 'Applications — None yet',
  render: () => (
    <EmptyState
      variant="no-applications"
      ctaLabel="Browse issues"
      onCta={() => alert('Browse issues')}
    />
  ),
}

export const NoAssignments: Story = {
  name: 'Assignments — None active',
  render: () => (
    <EmptyState
      variant="no-assignments"
      ctaLabel="Apply for an issue"
      onCta={() => alert('Browse issues')}
    />
  ),
}

export const NoActivity: Story = {
  name: 'Activity — No events',
  render: () => (
    <EmptyState
      variant="no-events"
      ctaLabel="Learn how activity is generated"
      onCta={() => alert('Open docs')}
    />
  ),
}

// --- Without CTA ---

export const NoCta: Story = {
  name: 'No CTA (read-only context)',
  render: () => <EmptyState variant="no-events" />,
}

// --- Compact panel variants ---

export const CompactNoApplications: Story = {
  name: 'Compact — No applications (panel)',
  render: () => (
    <div style={{ width: 320, background: '#1c1f2b', border: '1px solid #2e3347', borderRadius: 6, padding: 8 }}>
      <EmptyState
        variant="no-applications"
        compact
        ctaLabel="Browse issues"
        onCta={() => alert('Browse')}
      />
    </div>
  ),
}

export const CompactNoAssignments: Story = {
  name: 'Compact — No assignments (panel)',
  render: () => (
    <div style={{ width: 320, background: '#1c1f2b', border: '1px solid #2e3347', borderRadius: 6, padding: 8 }}>
      <EmptyState
        variant="no-assignments"
        compact
        ctaLabel="Apply for an issue"
        onCta={() => alert('Apply')}
      />
    </div>
  ),
}
