/**
 * ErrorRecovery — contract-aware error display for failed Soroban transactions (#326).
 *
 * Maps all 13 ContractError discriminants to plain-language explanations and
 * actionable recovery steps. Transient errors (network timeouts) get a Retry button.
 *
 * Usage:
 *   <ErrorRecovery
 *     errorCode={6}
 *     context={{ globalCount: 15 }}
 *     onRetry={() => resubmit()}
 *     onWithdraw={() => navigate('/withdraw')}
 *   />
 */

import React from 'react';
import { Icon } from './Icon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All stable error discriminants from ContractError in src/errors.rs */
export type ContractErrorCode =
  | 1   // AlreadyInitialized
  | 2   // NotInitialized
  | 3   // UnauthorizedAdmin
  | 4   // UnauthorizedMaintainer
  | 5   // UnauthorizedContributor
  | 6   // GlobalApplicationLimitReached
  | 7   // OrgAssignmentLimitReached
  | 8   // DuplicateApplication
  | 9   // ApplicationNotFound
  | 10  // AssignmentNotFound
  | 11  // AlreadyAssigned
  | 13  // CounterInconsistency
  | -1; // Network / timeout (not a contract error)

export interface ErrorRecoveryContext {
  /** Current global application count (for code 6) */
  globalCount?: number;
  /** Current org assignment count (for code 7) */
  orgCount?: number;
  /** Org id in context (for code 7) */
  orgId?: string;
}

export interface ErrorRecoveryProps {
  /** Numeric contract error code (1–13) or -1 for network/timeout errors. */
  errorCode: ContractErrorCode | number;
  /** Optional raw error string shown in details disclosure (dev/support use). */
  rawError?: string;
  /** Runtime context to enrich the message. */
  context?: ErrorRecoveryContext;
  /** Called when the user clicks Retry (available for transient errors). */
  onRetry?: () => void;
  /** Called when the user clicks the withdrawal CTA (error code 6). */
  onWithdraw?: () => void;
  /** Called when the user clicks the primary CTA. */
  onCta?: () => void;
}

// ---------------------------------------------------------------------------
// Error catalogue
// ---------------------------------------------------------------------------

interface ErrorEntry {
  title: string;
  message: (ctx: ErrorRecoveryContext) => string;
  /** 'transient' errors get a Retry button; 'action' errors get CTA; 'info' no buttons */
  kind: 'transient' | 'action' | 'info';
  severity: 'error' | 'warning' | 'info';
  ctaLabel?: string;
  ctaAction?: 'retry' | 'withdraw' | 'custom';
  resolution: string;
}

const ERROR_CATALOGUE: Record<number, ErrorEntry> = {
  [-1]: {
    title: 'Connection timed out',
    message: () =>
      'The transaction request timed out before reaching the network. This is usually temporary.',
    kind: 'transient',
    severity: 'warning',
    ctaLabel: 'Try again',
    ctaAction: 'retry',
    resolution: 'Click "Try again" to resubmit. If the problem persists, check your internet connection.',
  },
  1: {
    title: 'Contract already initialised',
    message: () =>
      'This contract has already been set up. Calling initialise a second time is not allowed.',
    kind: 'info',
    severity: 'info',
    resolution: 'No action needed — the contract is already live. Do not call initialise again.',
  },
  2: {
    title: 'Contract not initialised',
    message: () =>
      'The contract has not been set up yet. All state-changing operations require initialisation first.',
    kind: 'info',
    severity: 'error',
    resolution: 'The admin must call initialise before any other contract function.',
  },
  3: {
    title: 'Admin authorisation failed',
    message: () =>
      'This action requires admin privileges. The transaction was signed by the wrong account.',
    kind: 'info',
    severity: 'error',
    resolution: 'Sign the transaction with the admin account registered on-chain.',
  },
  4: {
    title: 'Not a registered maintainer',
    message: () =>
      'You are not registered as a maintainer for this organisation. Only registered maintainers can assign, complete, or revoke issues.',
    kind: 'info',
    severity: 'error',
    resolution: 'Ask the admin to run register_maintainer for your account and organisation.',
  },
  5: {
    title: 'Contributor authorisation failed',
    message: () =>
      'The transaction must be signed by the contributor account listed in the request.',
    kind: 'info',
    severity: 'error',
    resolution: 'Ensure your connected wallet matches the contributor address in the request.',
  },
  6: {
    title: 'Global application limit reached',
    message: (ctx) => {
      const count = ctx.globalCount != null ? ctx.globalCount : 15;
      return `You currently have ${count} pending application${count !== 1 ? 's' : ''} across all organisations — the maximum allowed is 15. Withdraw at least one before applying again.`;
    },
    kind: 'action',
    severity: 'warning',
    ctaLabel: 'Withdraw an application',
    ctaAction: 'withdraw',
    resolution: 'Withdraw one or more existing applications to free a slot, then retry.',
  },
  7: {
    title: 'Organisation assignment limit reached',
    message: (ctx) => {
      const count = ctx.orgCount != null ? ctx.orgCount : 4;
      const org   = ctx.orgId ? ` in "${ctx.orgId}"` : '';
      return `You already have ${count} active assignment${count !== 1 ? 's' : ''}${org} — the maximum per organisation is 4. Complete or wait for revocation of an existing assignment before taking on more.`;
    },
    kind: 'info',
    severity: 'warning',
    resolution: 'A maintainer must complete or revoke one of your active assignments in this organisation.',
  },
  8: {
    title: 'Application already exists',
    message: () =>
      'You have already applied for this issue. Duplicate applications are not allowed.',
    kind: 'action',
    severity: 'info',
    ctaLabel: 'Withdraw and re-apply',
    ctaAction: 'withdraw',
    resolution: 'If you want to reset your application, withdraw it first then apply again.',
  },
  9: {
    title: 'Application not found',
    message: () =>
      'No pending application was found for this issue. It may have expired (Wave TTL elapsed) or was never submitted.',
    kind: 'action',
    severity: 'warning',
    ctaLabel: 'Apply for this issue',
    ctaAction: 'custom',
    resolution: 'Submit a new application. If within an active Wave, use extend_application_ttl to prevent future expiry.',
  },
  10: {
    title: 'Assignment not found',
    message: () =>
      'No active assignment was found for this issue and contributor. It may have already been completed or revoked.',
    kind: 'info',
    severity: 'info',
    resolution: 'Verify the current state using is_assigned before retrying.',
  },
  11: {
    title: 'Issue already assigned',
    message: () =>
      'This issue already has an active assignment. It must be completed or revoked before it can be assigned again.',
    kind: 'info',
    severity: 'warning',
    resolution: 'Use complete_assignment or revoke_assignment to close the existing assignment first.',
  },
  13: {
    title: 'Storage inconsistency detected',
    message: () =>
      'An internal counter inconsistency was detected — the assignment entry exists but the organisation counter is zero. This indicates a storage corruption or migration error.',
    kind: 'info',
    severity: 'error',
    resolution: 'Contact the contract admin to run a corrective migration script before retrying.',
  },
};

const FALLBACK_ENTRY: ErrorEntry = {
  title: 'Unexpected contract error',
  message: () => 'An unexpected error was returned by the contract. Please try again or contact support.',
  kind: 'transient',
  severity: 'error',
  ctaLabel: 'Try again',
  ctaAction: 'retry',
  resolution: 'If the problem persists, include the error code and transaction details when contacting support.',
};

// ---------------------------------------------------------------------------
// Severity styles
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<string, React.CSSProperties> = {
  error:   { '--er-accent': 'var(--color-revoke, #dc2626)' }   as React.CSSProperties,
  warning: { '--er-accent': 'var(--color-warning-500, #eab308)' } as React.CSSProperties,
  info:    { '--er-accent': 'var(--color-primary, #6c8eff)' }   as React.CSSProperties,
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  error:   <Icon name="error"   size="md" />,
  warning: <Icon name="warning" size="md" />,
  info:    <Icon name="info"    size="md" />,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ErrorRecovery({
  errorCode,
  rawError,
  context = {},
  onRetry,
  onWithdraw,
  onCta,
}: ErrorRecoveryProps) {
  const entry = ERROR_CATALOGUE[errorCode] ?? FALLBACK_ENTRY;
  const showRetry   = entry.ctaAction === 'retry'    && onRetry;
  const showWithdraw = entry.ctaAction === 'withdraw' && onWithdraw;
  const showCta     = entry.ctaAction === 'custom'   && onCta;

  return (
    <div
      className="error-recovery"
      role="alert"
      aria-label={entry.title}
      style={SEVERITY_STYLES[entry.severity]}
    >
      {/* ── Header ── */}
      <div className="error-recovery__header">
        <span className="error-recovery__icon" aria-hidden="true">
          {SEVERITY_ICON[entry.severity]}
        </span>
        <div className="error-recovery__heading">
          <p className="error-recovery__code">
            {errorCode === -1 ? 'TIMEOUT' : `Error ${errorCode}`}
          </p>
          <h3 className="error-recovery__title">{entry.title}</h3>
        </div>
      </div>

      {/* ── Message ── */}
      <p className="error-recovery__message">{entry.message(context)}</p>

      {/* ── Resolution hint ── */}
      <div className="error-recovery__resolution">
        <strong>What to do: </strong>{entry.resolution}
      </div>

      {/* ── Actions ── */}
      {(showRetry || showWithdraw || showCta) && (
        <div className="error-recovery__actions">
          {showRetry && (
            <button className="btn btn-primary btn-sm" onClick={onRetry}>
              <Icon name="retry" size="sm" />
              Try again
            </button>
          )}
          {showWithdraw && (
            <button className="btn btn-secondary btn-sm" onClick={onWithdraw}>
              <Icon name="withdraw" size="sm" />
              {entry.ctaLabel}
            </button>
          )}
          {showCta && (
            <button className="btn btn-primary btn-sm" onClick={onCta}>
              {entry.ctaLabel}
            </button>
          )}
        </div>
      )}

      {/* ── Raw error disclosure (dev / support) ── */}
      {rawError && (
        <details className="error-recovery__details">
          <summary>Technical details</summary>
          <code className="error-recovery__raw">{rawError}</code>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: parse a raw contract error string into a numeric code
// ---------------------------------------------------------------------------

/**
 * Extracts a numeric error code from a Soroban RPC error string.
 * Returns -1 (timeout) when the string matches known transient patterns.
 * Returns undefined when no code can be parsed.
 *
 * @example
 *   parseContractErrorCode('ContractError(6)')  // → 6
 *   parseContractErrorCode('timeout')           // → -1
 */
export function parseContractErrorCode(raw: string): ContractErrorCode | undefined {
  if (/timeout|timed?\s*out|econnreset|network/i.test(raw)) return -1;

  const match = raw.match(/ContractError\((\d+)\)|error[_\s]code[:\s]+(\d+)|code[:\s]+(\d+)/i);
  if (match) {
    const code = parseInt(match[1] ?? match[2] ?? match[3], 10);
    if (code in ERROR_CATALOGUE) return code as ContractErrorCode;
  }
  return undefined;
}
