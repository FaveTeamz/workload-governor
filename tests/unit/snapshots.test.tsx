import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Components under test
import { IssueCard } from '../../frontend/src/components/IssueCard';
import { AssignmentCard } from '../../frontend/src/components/AssignmentCard';
import { ApplicationBadge } from '../../frontend/src/components/ApplicationBadge';
import { NavBar } from '../../frontend/src/components/NavBar';
import { MaintainerPanel } from '../../frontend/src/components/MaintainerPanel';

// ---------------------------------------------------------------------------
// IssueCard snapshots
// ---------------------------------------------------------------------------
describe('IssueCard snapshots', () => {
  const base = { id: 'i1', org: 'stellar-org', title: 'Fix TTL bug', onApply: vi.fn(), onWithdraw: vi.fn() };

  it('status=open', () => {
    const { container } = render(<IssueCard {...base} status="open" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('status=applied', () => {
    const { container } = render(<IssueCard {...base} status="applied" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('status=assigned', () => {
    const { container } = render(<IssueCard {...base} status="assigned" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('status=completed', () => {
    const { container } = render(<IssueCard {...base} status="completed" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// AssignmentCard snapshots
// ---------------------------------------------------------------------------
describe('AssignmentCard snapshots', () => {
  const base = {
    issueId: 'a1',
    org: 'stellar-org',
    title: 'Optimise WASM size',
    contributor: 'GBXXX1ABCDE',
  };

  it('with actions', () => {
    const { container } = render(
      <AssignmentCard {...base} onComplete={vi.fn()} onRevoke={vi.fn()} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('without actions', () => {
    const { container } = render(<AssignmentCard {...base} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// ApplicationBadge snapshots
// ---------------------------------------------------------------------------
describe('ApplicationBadge snapshots', () => {
  for (const status of ['pending', 'assigned', 'completed', 'withdrawn'] as const) {
    it(`status=${status}`, () => {
      const { container } = render(<ApplicationBadge status={status} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  }
});

// ---------------------------------------------------------------------------
// NavBar snapshots
// ---------------------------------------------------------------------------
describe('NavBar snapshots', () => {
  it('disconnected', () => {
    const { container } = render(<NavBar onConnect={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('connected', () => {
    const { container } = render(
      <NavBar walletAddress="GBTEST1234ABCD" onDisconnect={vi.fn()} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// MaintainerPanel snapshots
// ---------------------------------------------------------------------------
describe('MaintainerPanel snapshots', () => {
  const applications = [
    { id: '1', contributor: 'GBXXX1ABCDEFGHIJKLMNO12345', org: 'stellar-org', issueTitle: 'Fix bug', appliedDate: '2026-06-20' },
  ];
  const assignments = [
    { id: 'a1', contributor: 'GBXXX1ABCDEFGHIJKLMNO12345', org: 'stellar-org', issueTitle: 'Optimise WASM' },
  ];

  it('with applications and assignments', () => {
    const { container } = render(
      <MaintainerPanel
        applications={applications}
        assignments={assignments}
        onAssign={vi.fn()}
        onComplete={vi.fn()}
        onRevoke={vi.fn()}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('empty state', () => {
    const { container } = render(
      <MaintainerPanel
        applications={[]}
        assignments={[]}
        onAssign={vi.fn()}
        onComplete={vi.fn()}
        onRevoke={vi.fn()}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
