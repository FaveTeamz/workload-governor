import type { Meta, StoryObj } from '@storybook/react'
import { IssueCard } from '../components/IssueCard'

const meta: Meta<typeof IssueCard> = {
  title:     'Components/IssueCard',
  component: IssueCard,
  tags:      ['autodocs'],
  parameters: {
    layout: 'padded',
  },
}
export default meta
type Story = StoryObj<typeof IssueCard>

// ── #646: Progressive disclosure stories ──

export const Collapsed: Story = {
  name: 'Collapsed (no details)',
  args: {
    id:     '101',
    org:    'stellar-org',
    title:  'Fix TTL extension bug in WorkloadGovernor',
    status: 'open',
    // No details prop → no toggle rendered
  },
}

export const CollapsedWithDetails: Story = {
  name: 'Collapsed with details (cap available)',
  args: {
    id:     '102',
    org:    'stellar-org',
    title:  'Add prop tests for assign_issue',
    status: 'open',
    details: {
      applicantCount:       3,
      globalSlotsRemaining: 12,
      orgSlotsRemaining:    3,
      ttlExpiresAt:         null,
    },
  },
}

export const ExpandedCapAvailable: Story = {
  name: 'Expanded — cap available',
  args: {
    id:     '103',
    org:    'meridian-dao',
    title:  'Docs: storage design overview',
    status: 'open',
    details: {
      applicantCount:       7,
      globalSlotsRemaining: 10,
      orgSlotsRemaining:    3,
      ttlExpiresAt:         null,
    },
  },
  play: async ({ canvasElement }) => {
    // Open the details panel on render
    const toggle = canvasElement.querySelector('.issue-card__toggle') as HTMLButtonElement | null
    toggle?.click()
  },
}

export const ExpandedAtGlobalCap: Story = {
  name: 'Expanded — at global cap limit',
  args: {
    id:     '104',
    org:    'stellar-org',
    title:  'Optimize WASM binary size',
    status: 'open',
    details: {
      applicantCount:       2,
      globalSlotsRemaining: 0,
      orgSlotsRemaining:    2,
      ttlExpiresAt:         null,
    },
  },
  play: async ({ canvasElement }) => {
    const toggle = canvasElement.querySelector('.issue-card__toggle') as HTMLButtonElement | null
    toggle?.click()
  },
}

export const ExpandedAtOrgCap: Story = {
  name: 'Expanded — at org cap limit',
  args: {
    id:     '105',
    org:    'stellar-org',
    title:  'Integration tests for SDK',
    status: 'open',
    details: {
      applicantCount:       5,
      globalSlotsRemaining: 8,
      orgSlotsRemaining:    0,
      ttlExpiresAt:         null,
    },
  },
  play: async ({ canvasElement }) => {
    const toggle = canvasElement.querySelector('.issue-card__toggle') as HTMLButtonElement | null
    toggle?.click()
  },
}

export const ExpandedAppliedWithTtl: Story = {
  name: 'Expanded — applied with TTL countdown',
  args: {
    id:     '106',
    org:    'meridian-dao',
    title:  'Write contributor onboarding guide',
    status: 'applied',
    details: {
      applicantCount:       4,
      globalSlotsRemaining: 11,
      orgSlotsRemaining:    2,
      // TTL 2 hours from now
      ttlExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
  },
  play: async ({ canvasElement }) => {
    const toggle = canvasElement.querySelector('.issue-card__toggle') as HTMLButtonElement | null
    toggle?.click()
  },
}

export const StatusVariants: Story = {
  name: 'All status variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px' }}>
      {(['open', 'applied', 'assigned', 'completed'] as const).map((status) => (
        <IssueCard
          key={status}
          id={status}
          org="stellar-org"
          title={`Issue in ${status} state`}
          status={status}
          details={{
            applicantCount:       3,
            globalSlotsRemaining: 10,
            orgSlotsRemaining:    3,
          }}
        />
      ))}
    </div>
  ),
}
