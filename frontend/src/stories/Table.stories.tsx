import type { Meta, StoryObj } from '@storybook/react'
import { Table } from '../components/Table'
import { Badge } from '../components/Badge'

const meta: Meta<typeof Table> = {
  title:     'Design System/Table',
  component: Table,
  tags:      ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Table>

const columns = [
  { key: 'contributor', header: 'Contributor' },
  { key: 'org',         header: 'Organisation' },
  { key: 'issue',       header: 'Issue' },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <Badge variant={row.status === 'assigned' ? 'info' : row.status === 'completed' ? 'success' : 'neutral'}>
        {String(row.status)}
      </Badge>
    ),
  },
]

const rows = [
  { contributor: 'alice.xlm', org: 'stellar',   issue: '#42 — Add fee bumping',  status: 'assigned'  },
  { contributor: 'bob.xlm',   org: 'soroban',   issue: '#17 — Fix auth re-entry', status: 'completed' },
  { contributor: 'carol.xlm', org: 'horizon',   issue: '#88 — Pagination cursor', status: 'pending'   },
]

export const Default: Story = { render: () => <Table columns={columns} rows={rows} caption="Active Assignments" /> }
export const Empty: Story   = { render: () => <Table columns={columns} rows={[]}   caption="No Data" /> }
