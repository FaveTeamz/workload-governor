import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { IssueCard } from '../components/IssueCard'

const meta = {
  title: 'Components/IssueCard',
  component: IssueCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    id: '101',
    org: 'stellar-org',
    title: 'Fix TTL extension bug in WorkloadGovernor',
    status: 'open',
    globalCapReached: false,
    onApply: fn(),
    onWithdraw: fn(),
    onApplyError: fn(),
  },
  argTypes: {
    status: { control: 'select', options: ['open', 'applied', 'assigned', 'completed'] },
  },
} satisfies Meta<typeof IssueCard>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
export const AtGlobalCap: Story = { args: { globalCapReached: true } }
export const Applied: Story = { args: { status: 'applied' } }

export const StatusVariants: Story = {
  name: 'All status variants',
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px' }}>
      {(['open', 'applied', 'assigned', 'completed'] as const).map((status) => (
        <IssueCard {...args} key={status} id={status} status={status} />
      ))}
    </div>
  ),
}
