/**
 * Complete Table stories for the design system.
 * Covers empty, loading, and populated states.
 * Dark-mode variants included.
 *
 * Closes #541
 */
import type { Meta, StoryObj } from '@storybook/react';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';
import type { BadgeVariant } from '../components/Badge';

// ── Sample data ───────────────────────────────────────────────────────────────

interface Application {
  id: string;
  contributor: string;
  org: string;
  issue: string;
  status: string;
  appliedDate: string;
}

const APPLICATIONS: Application[] = [
  {
    id: '1',
    contributor: 'GBXXX1ABCD',
    org: 'stellar-org',
    issue: 'Fix TTL extension bug',
    status: 'Pending',
    appliedDate: '2026-06-20',
  },
  {
    id: '2',
    contributor: 'GCYYY2PQRS',
    org: 'stellar-org',
    issue: 'Add prop tests for assign_issue',
    status: 'Assigned',
    appliedDate: '2026-06-21',
  },
  {
    id: '3',
    contributor: 'GAZZZ3FGHI',
    org: 'meridian-dao',
    issue: 'Docs: storage design overview',
    status: 'Completed',
    appliedDate: '2026-06-22',
  },
  {
    id: '4',
    contributor: 'GDWWW4LMNO',
    org: 'meridian-dao',
    issue: 'Integration tests for SDK',
    status: 'Pending',
    appliedDate: '2026-06-18',
  },
];

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  Pending: 'info',
  Assigned: 'warning',
  Completed: 'success',
  Rejected: 'error',
};

const columns = [
  {
    key: 'contributor',
    header: 'Contributor',
    render: (row: Record<string, unknown>) => (
      <code style={{ fontFamily: 'monospace' }}>{String(row.contributor)}</code>
    ),
  },
  {
    key: 'org',
    header: 'Organisation',
  },
  {
    key: 'issue',
    header: 'Issue',
  },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) => {
      const s = String(row.status);
      return (
        <Badge variant={STATUS_VARIANT[s] ?? 'neutral'}>{s}</Badge>
      );
    },
  },
  {
    key: 'appliedDate',
    header: 'Applied',
  },
];

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof Table> = {
  title: 'Design System/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Table>;

// ── State stories ─────────────────────────────────────────────────────────────

/** Table populated with application rows. */
export const Populated: Story = {
  render: () => (
    <Table<Application>
      caption="Contributor Applications"
      columns={columns}
      rows={APPLICATIONS}
    />
  ),
};

/** Table with no rows — displays empty state. */
export const Empty: Story = {
  render: () => (
    <Table<Application>
      caption="Contributor Applications"
      columns={columns}
      rows={[]}
    />
  ),
};

/**
 * Simulated loading state: uses aria-busy on the wrapper and skeleton rows.
 * The Table component does not have a native loading prop so we show a
 * spinner placeholder via a custom render.
 */
export const Loading: Story = {
  render: () => (
    <div aria-busy="true" role="region" aria-label="Loading contributor applications">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '16px',
          background: 'var(--color-surface, #1e2235)',
          borderRadius: 'var(--radius)',
        }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-border, #2e3347)',
              opacity: 0.6,
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:0.25} }`}</style>
    </div>
  ),
};

// ── Dark-mode snapshots ───────────────────────────────────────────────────────

export const PopulatedDark: Story = {
  name: 'Populated (dark)',
  render: () => (
    <div data-theme="dark" style={{ background: '#0f1117', padding: '24px' }}>
      <Table<Application>
        caption="Contributor Applications"
        columns={columns}
        rows={APPLICATIONS}
      />
    </div>
  ),
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};

export const EmptyDark: Story = {
  name: 'Empty (dark)',
  render: () => (
    <div data-theme="dark" style={{ background: '#0f1117', padding: '24px' }}>
      <Table<Application>
        caption="Contributor Applications"
        columns={columns}
        rows={[]}
      />
    </div>
  ),
  parameters: {
    themes: { themeOverride: 'dark' },
    chromatic: { modes: { dark: { theme: 'dark' } } },
  },
};
