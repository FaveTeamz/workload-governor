import React, { useState, useMemo } from 'react';

export type EventType =
  | 'ApplicationSubmitted'
  | 'ApplicationWithdrawn'
  | 'IssueAssigned'
  | 'AssignmentCompleted'
  | 'AssignmentRevoked'
  | 'TTLExtended';

export interface GovernorEvent {
  id: string;
  txHash: string;
  eventType: EventType;
  orgId: string;
  issueId: number;
  contributorAddress: string;
  timestamp: number;
}

export interface TransactionHistoryLogProps {
  events: GovernorEvent[];
  isLoading: boolean;
  onRefreshEvents?: () => void;
}

export const TransactionHistoryLog: React.FC<TransactionHistoryLogProps> = ({
  events,
  isLoading,
  onRefreshEvents,
}) => {
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [searchOrgId, setSearchOrgId] = useState<string>('');

  // Filter events in memory without extra API calls
  const filteredEvents = useMemo(() => {
    return events
      .filter((ev) => {
        if (selectedEventType !== 'ALL' && ev.eventType !== selectedEventType) {
          return false;
        }
        if (
          searchOrgId.trim() &&
          !ev.orgId.toLowerCase().includes(searchOrgId.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Chronological: newest first
  }, [events, selectedEventType, searchOrgId]);

  // CSV export function for visible/filtered rows
  const exportToCSV = () => {
    if (filteredEvents.length === 0) return;

    const headers = ['Event ID', 'Timestamp (UTC)', 'Action Type', 'Org ID', 'Issue ID', 'Contributor', 'Tx Hash'];
    const rows = filteredEvents.map((ev) => [
      ev.id,
      new Date(ev.timestamp * 1000).toISOString(),
      ev.eventType,
      ev.orgId,
      ev.issueId.toString(),
      ev.contributorAddress,
      ev.txHash,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.map((field) => `"${field}"`).join(','))].join(
      '\n'
    );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `workload_governor_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBadgeStyle = (eventType: EventType) => {
    switch (eventType) {
      case 'ApplicationSubmitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      case 'ApplicationWithdrawn':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      case 'IssueAssigned':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
      case 'AssignmentCompleted':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'AssignmentRevoked':
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      case 'TTLExtended':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="tx-history-log bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            📜 Contributor Activity &amp; Transaction Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Indexed on-chain contract events from Soroban Horizon RPC
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefreshEvents && (
            <button
              onClick={onRefreshEvents}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-md transition"
            >
              🔄 Sync
            </button>
          )}
          <button
            onClick={exportToCSV}
            disabled={filteredEvents.length === 0}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1 ${
              filteredEvents.length === 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer'
            }`}
          >
            📥 Export CSV ({filteredEvents.length})
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
            Filter by Action Type
          </label>
          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="w-full px-3 py-1.5 border rounded-md text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700"
          >
            <option value="ALL">All Events</option>
            <option value="ApplicationSubmitted">Application Submitted</option>
            <option value="ApplicationWithdrawn">Application Withdrawn</option>
            <option value="IssueAssigned">Issue Assigned</option>
            <option value="AssignmentCompleted">Assignment Completed</option>
            <option value="AssignmentRevoked">Assignment Revoked</option>
            <option value="TTLExtended">TTL Extended</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
            Filter by Organization ID
          </label>
          <input
            type="text"
            placeholder="Search Org ID..."
            value={searchOrgId}
            onChange={(e) => setSearchOrgId(e.target.value)}
            className="w-full px-3 py-1.5 border rounded-md text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700"
          />
        </div>
      </div>

      {/* Log Table */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500 text-sm">Indexing Horizon contract events...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          No transaction events found matching selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 uppercase text-slate-500 font-semibold">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Event Action</th>
                <th className="p-3">Org</th>
                <th className="p-3">Issue ID</th>
                <th className="p-3">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
              {filteredEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                  <td className="p-3 font-sans text-slate-600 dark:text-slate-400">
                    {new Date(ev.timestamp * 1000).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBadgeStyle(ev.eventType)}`}>
                      {ev.eventType}
                    </span>
                  </td>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{ev.orgId}</td>
                  <td className="p-3">#{ev.issueId}</td>
                  <td className="p-3 text-slate-500">
                    <a
                      href={`https://stellar.expert/explorer/public/tx/${ev.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline text-indigo-600 dark:text-indigo-400"
                    >
                      {ev.txHash.slice(0, 8)}...{ev.txHash.slice(-6)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
