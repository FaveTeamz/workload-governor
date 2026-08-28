'use client';

import NavBar from '@/components/NavBar';
import IssueCardGrid from '@/components/IssueCard';
import EventHistoryTable from '@/components/EventHistoryTable';
import EmptyState from '@/components/EmptyState';
import TxConfirmModal from '@/components/TxConfirmModal';
import { useState } from 'react';

// Sample data — in production these come from the API
const sampleIssues = [
  { id: 'issue_1', title: 'Fix memory leak in sync service', org: 'org_stellar_001', status: 'open' as const, reward: 50 },
  { id: 'issue_2', title: 'Add multi-org support', org: 'org_stellar_001', status: 'open' as const, reward: 80 },
  { id: 'issue_3', title: 'Improve error messages', org: 'org_stellar_002', status: 'open' as const, reward: 30 },
];

const sampleEvents = [
  { id: 'evt_1', eventType: 'applied', org: 'org_stellar_001', issueId: 'issue_1', contributor: 'GAEZI...', timestamp: '2026-07-01T12:00:00Z' },
  { id: 'evt_2', eventType: 'assigned', org: 'org_stellar_001', issueId: 'issue_2', contributor: 'GAEZI...', timestamp: '2026-07-10T09:00:00Z' },
];

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  const handleApply = (issueId: string) => {
    setSelectedIssue(issueId);
    setModalOpen(true);
  };

  const handleConfirm = () => {
    // In production: submit application transaction
    setModalOpen(false);
    setSelectedIssue(null);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <NavBar />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Open Issues Section */}
        <section aria-labelledby="issues-heading" className="mb-12">
          <h2
            id="issues-heading"
            className="mb-6 text-2xl font-semibold text-[var(--color-text-primary)]"
          >
            Open Issues
          </h2>
          {sampleIssues.length > 0 ? (
            <IssueCardGrid issues={sampleIssues} onApply={handleApply} />
          ) : (
            <EmptyState variant="no-issues" />
          )}
        </section>

        {/* Event History Section */}
        <section aria-labelledby="history-heading" className="mb-12">
          <h2
            id="history-heading"
            className="mb-6 text-2xl font-semibold text-[var(--color-text-primary)]"
          >
            Event History
          </h2>
          {sampleEvents.length > 0 ? (
            <EventHistoryTable events={sampleEvents} />
          ) : (
            <EmptyState variant="no-history" />
          )}
        </section>

        {/* Active Assignments — show empty state for demo */}
        <section aria-labelledby="assignments-heading">
          <h2
            id="assignments-heading"
            className="mb-6 text-2xl font-semibold text-[var(--color-text-primary)]"
          >
            Active Assignments
          </h2>
          <EmptyState variant="no-assignments" />
        </section>
      </main>

      {/* Transaction Confirmation Modal */}
      <TxConfirmModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        title="Apply for Issue"
        description={`You are about to apply for issue ${selectedIssue ?? ''}. This will submit a transaction to the Stellar network.`}
      />
    </div>
  );
}
