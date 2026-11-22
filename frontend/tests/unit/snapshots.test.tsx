/**
 * Snapshot tests for the design-system component library.
 *
 * Covers every component + variant listed in the requirements:
 *   Button   – primary / secondary / ghost  (default md size + sm size)
 *   Badge    – success / warning / error / info / neutral
 *   Card     – minimal / with title / with title & footer
 *   Modal    – open / closed
 *   Table    – empty / populated
 *   Gauge    – 0 % / 50 % / 100 %
 *
 * Snapshots are written to tests/unit/snapshots/ (configured in vitest.config.ts).
 *
 * Run once to generate:   npm run test:snapshots
 * Update intentionally:   npm run test:update-snapshots
 * CI fails on mismatch:   npm test  (vitest run has --ci semantics by default)
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Button } from '../../src/components/Button'
import { Badge } from '../../src/components/Badge'
import { Card } from '../../src/components/Card'
import { Modal } from '../../src/components/Modal'
import { Table } from '../../src/components/Table'
import { Gauge } from '../../src/components/Gauge'

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

describe('Button snapshots', () => {
  it('primary (default)', () => {
    const { container } = render(<Button variant="primary">Submit</Button>)
    expect(container).toMatchSnapshot()
  })

  it('secondary', () => {
    const { container } = render(<Button variant="secondary">Cancel</Button>)
    expect(container).toMatchSnapshot()
  })

  it('ghost', () => {
    const { container } = render(<Button variant="ghost">Learn more</Button>)
    expect(container).toMatchSnapshot()
  })

  it('primary sm', () => {
    const { container } = render(<Button variant="primary" size="sm">Save</Button>)
    expect(container).toMatchSnapshot()
  })

  it('secondary sm', () => {
    const { container } = render(<Button variant="secondary" size="sm">Edit</Button>)
    expect(container).toMatchSnapshot()
  })

  it('ghost sm', () => {
    const { container } = render(<Button variant="ghost" size="sm">Dismiss</Button>)
    expect(container).toMatchSnapshot()
  })

  it('disabled', () => {
    const { container } = render(<Button variant="primary" disabled>Unavailable</Button>)
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

describe('Badge snapshots', () => {
  it('success', () => {
    const { container } = render(<Badge variant="success">Completed</Badge>)
    expect(container).toMatchSnapshot()
  })

  it('warning', () => {
    const { container } = render(<Badge variant="warning">Pending</Badge>)
    expect(container).toMatchSnapshot()
  })

  it('error', () => {
    const { container } = render(<Badge variant="error">Failed</Badge>)
    expect(container).toMatchSnapshot()
  })

  it('info', () => {
    const { container } = render(<Badge variant="info">Draft</Badge>)
    expect(container).toMatchSnapshot()
  })

  it('neutral (default)', () => {
    const { container } = render(<Badge variant="neutral">Unknown</Badge>)
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

describe('Card snapshots', () => {
  it('body only', () => {
    const { container } = render(<Card>Card body content</Card>)
    expect(container).toMatchSnapshot()
  })

  it('with title', () => {
    const { container } = render(
      <Card title="My Card Title">Card body content</Card>
    )
    expect(container).toMatchSnapshot()
  })

  it('with title and footer', () => {
    const { container } = render(
      <Card title="My Card Title" footer={<button>Action</button>}>
        Card body content
      </Card>
    )
    expect(container).toMatchSnapshot()
  })

  it('with custom className', () => {
    const { container } = render(
      <Card className="card--highlighted">Highlighted card</Card>
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

describe('Modal snapshots', () => {
  it('closed', () => {
    const { container } = render(
      <Modal open={false} title="Confirm Action" onClose={() => {}}>
        <p>Are you sure you want to proceed?</p>
      </Modal>
    )
    expect(container).toMatchSnapshot()
  })

  it('open', () => {
    const { container } = render(
      <Modal open={true} title="Confirm Action" onClose={() => {}}>
        <p>Are you sure you want to proceed?</p>
      </Modal>
    )
    expect(container).toMatchSnapshot()
  })

  it('open with footer', () => {
    const { container } = render(
      <Modal
        open={true}
        title="Delete Item"
        onClose={() => {}}
        footer={
          <>
            <button>Cancel</button>
            <button>Delete</button>
          </>
        }
      >
        <p>This action cannot be undone.</p>
      </Modal>
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const TABLE_COLUMNS = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status' },
]

const TABLE_ROWS = [
  { id: '1', name: 'Alice', status: 'active' },
  { id: '2', name: 'Bob', status: 'pending' },
  { id: '3', name: 'Carol', status: 'inactive' },
]

describe('Table snapshots', () => {
  it('empty (no rows)', () => {
    const { container } = render(
      <Table columns={TABLE_COLUMNS} rows={[]} caption="Contributors" />
    )
    expect(container).toMatchSnapshot()
  })

  it('populated', () => {
    const { container } = render(
      <Table columns={TABLE_COLUMNS} rows={TABLE_ROWS} caption="Contributors" />
    )
    expect(container).toMatchSnapshot()
  })

  it('populated with custom render', () => {
    const columnsWithRender = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
      {
        key: 'status',
        header: 'Status',
        render: (row: Record<string, unknown>) => (
          <Badge variant={row.status === 'active' ? 'success' : 'neutral'}>
            {String(row.status)}
          </Badge>
        ),
      },
    ]
    const { container } = render(
      <Table columns={columnsWithRender} rows={TABLE_ROWS} caption="Contributors with badges" />
    )
    expect(container).toMatchSnapshot()
  })

  it('no caption', () => {
    const { container } = render(
      <Table columns={TABLE_COLUMNS} rows={TABLE_ROWS} />
    )
    expect(container).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

describe('Gauge snapshots', () => {
  it('0% (value=0, max=15)', () => {
    const { container } = render(
      <Gauge value={0} max={15} label="Global Applications" />
    )
    expect(container).toMatchSnapshot()
  })

  it('50% (value=7, max=15)', () => {
    // Round(7/15*100) = 47 % — use value=8 for a clean ~53 %, or keep at 7
    // Use exact 50 %: value=1, max=2 for cleaner snapshot
    const { container } = render(
      <Gauge value={1} max={2} label="Global Applications" />
    )
    expect(container).toMatchSnapshot()
  })

  it('~50% realistic (value=7, max=15)', () => {
    const { container } = render(
      <Gauge value={7} max={15} label="Global Applications" />
    )
    expect(container).toMatchSnapshot()
  })

  it('100% (value=15, max=15)', () => {
    const { container } = render(
      <Gauge value={15} max={15} label="Global Applications" />
    )
    expect(container).toMatchSnapshot()
  })

  it('warning range (value=10, max=15)', () => {
    const { container } = render(
      <Gauge value={10} max={15} label="Global Applications" />
    )
    expect(container).toMatchSnapshot()
  })

  it('no label', () => {
    const { container } = render(<Gauge value={4} max={4} />)
    expect(container).toMatchSnapshot()
  })

  it('custom size', () => {
    const { container } = render(
      <Gauge value={2} max={4} label="Org Assignments" size={80} />
    )
    expect(container).toMatchSnapshot()
  })
})
