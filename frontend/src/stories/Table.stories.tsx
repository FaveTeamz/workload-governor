/**
 * Table stories — closes #279
 *
 * Maps to the panel-list/panel-row pattern in MaintainerPanel, which is the
 * primary "table" pattern in the design system (a virtualised list of rows).
 * Covers: empty, loading, populated, and sortable states.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

// Re-use the same truncate util as MaintainerPanel for consistent display.
function truncate(addr: string) {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

// ── Data types ────────────────────────────────────────────────────────────────

interface Row {
  id:           string;
  contributor:  string;
  org:          string;
  issueTitle:   string;
  appliedDate:  string;
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_ROWS: Row[] = [
  { id: '1', contributor: 'GBXXX1ABCDEFGHIJKLMNO12345', org: 'stellar-org',  issueTitle: 'Fix TTL extension bug',           appliedDate: '2026-06-20' },
  { id: '2', contributor: 'GCYYY2PQRSTUVWXYZABCDE67890', org: 'stellar-org',  issueTitle: 'Add prop tests for assign_issue', appliedDate: '2026-06-21' },
  { id: '3', contributor: 'GAZZZ3FGHIJKLMNOPQRST11111', org: 'meridian-dao', issueTitle: 'Docs: storage design overview',   appliedDate: '2026-06-22' },
  { id: '4', contributor: 'GDWWW4LMNOPQRSTUVWXYZ22222', org: 'meridian-dao', issueTitle: 'Refactor apply_for_issue logic',  appliedDate: '2026-06-23' },
];

// ── Base table component ──────────────────────────────────────────────────────

interface TableProps {
  rows:      Row[];
  loading:   boolean;
  sortable:  boolean;
}

type SortKey = 'org' | 'appliedDate' | 'issueTitle';

function Table({ rows, loading, sortable }: TableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('appliedDate');
  const [sortAsc, setSortAsc]  = useState(true);

  function handleSort(key: SortKey) {
    if (!sortable) return;
    if (key === sortKey) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = sortable
    ? [...rows].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      })
    : rows;

  const sortIcon = (key: SortKey) => {
    if (!sortable) return null;
    if (sortKey !== key) return <span aria-hidden="true" style={{ color: 'var(--color-border)' }}> ↕</span>;
    return <span aria-hidden="true"> {sortAsc ? '↑' : '↓'}</span>;
  };

  // Loading skeleton rows
  if (loading) {
    return (
      <div className="panel-column" style={{ padding: '16px' }}>
        <h2 style={{ marginBottom: '12px' }}>
          Pending Applications
          <span className="count-badge" style={{ opacity: '.4' }}>–</span>
        </h2>
        <ul className="panel-list" aria-label="Loading…" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <li
              key={i}
              className="panel-row"
              style={{ animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.5 }}
              aria-hidden="true"
            >
              <div className="row-info">
                <span style={bar(90)}  />
                <span style={bar(70)}  />
                <span style={bar(160)} />
              </div>
              <div style={bar(64, 28)} />
            </li>
          ))}
        </ul>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className="panel-column" style={{ padding: '16px' }}>
        <h2 style={{ marginBottom: '12px' }}>
          Pending Applications
          <span className="count-badge">0</span>
        </h2>
        <p className="empty-state" role="status">No pending applications.</p>
      </div>
    );
  }

  return (
    <div className="panel-column" style={{ padding: '16px' }}>
      <h2 style={{ marginBottom: '12px' }}>
        Pending Applications
        <span className="count-badge" aria-label={`${sorted.length} items`}>{sorted.length}</span>
      </h2>

      {/* Column headers (sortable variant only) */}
      {sortable && (
        <div
          className="row-info"
          style={{ padding: '4px 10px', fontSize: 'var(--text-xs)', color: 'var(--color-muted)', fontWeight: 600 }}
        >
          <span style={{ width: '90px' }}>Contributor</span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '0 4px', fontSize: 'inherit', fontWeight: 600 }}
            onClick={() => handleSort('org')}
            aria-label={`Sort by organisation, currently ${sortKey === 'org' ? (sortAsc ? 'ascending' : 'descending') : 'unsorted'}`}
          >
            Org{sortIcon('org')}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '0 4px', fontSize: 'inherit', fontWeight: 600, flex: 1 }}
            onClick={() => handleSort('issueTitle')}
            aria-label="Sort by issue title"
          >
            Issue{sortIcon('issueTitle')}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '0 4px', fontSize: 'inherit', fontWeight: 600 }}
            onClick={() => handleSort('appliedDate')}
            aria-label="Sort by date applied"
          >
            Date{sortIcon('appliedDate')}
          </button>
        </div>
      )}

      <ul className="panel-list" aria-label="Pending applications list">
        {sorted.map((row) => (
          <li key={row.id} className="panel-row">
            <div className="row-info">
              <span className="contributor" title={row.contributor}>{truncate(row.contributor)}</span>
              <span className="org">{row.org}</span>
              <span className="issue-title">{row.issueTitle}</span>
              <time className="date" dateTime={row.appliedDate}>
                {new Date(row.appliedDate).toLocaleDateString()}
              </time>
            </div>
            <div className="row-actions">
              <button className="btn btn-primary btn-sm">Assign</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bar(width: number, height = 14): React.CSSProperties {
  return {
    display: 'inline-block',
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-border)',
    flexShrink: 0,
  };
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<TableProps> = {
  title:     'Design System/Table',
  component: Table,
  tags:      ['autodocs'],
  argTypes: {
    loading:  { control: 'boolean' },
    sortable: { control: 'boolean' },
  },
  args: {
    rows:     SAMPLE_ROWS,
    loading:  false,
    sortable: false,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '800px', padding: '16px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<TableProps>;

// ── State stories ─────────────────────────────────────────────────────────────

export const Populated: Story = {
  name: 'Populated',
  args: { rows: SAMPLE_ROWS, loading: false, sortable: false },
};

export const Empty: Story = {
  name: 'Empty state',
  args: { rows: [], loading: false },
};

export const Loading: Story = {
  name: 'Loading skeleton',
  args: { loading: true, rows: [] },
};

export const Sortable: Story = {
  name: 'Sortable columns',
  args: { rows: SAMPLE_ROWS, sortable: true },
};
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
