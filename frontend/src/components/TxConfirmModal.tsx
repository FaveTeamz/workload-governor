import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react';
import type { UseTxModal } from '../hooks/useTxModal';

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Props {
  modal: UseTxModal;
}

/** Plain-language icon for the action type */
function actionIcon(action: string, destructive?: boolean): string {
  if (destructive) return '⚠️';
  const lower = action.toLowerCase();
  if (lower.includes('apply'))    return '📝';
  if (lower.includes('assign'))   return '✅';
  if (lower.includes('complete')) return '🎉';
  if (lower.includes('withdraw')) return '↩️';
  if (lower.includes('revoke'))   return '🚫';
  return '🔏';
}

export default function TxConfirmModal({ modal }: Props) {
  const { state, _resolve, _reject, close } = modal;
  const dialogRef     = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isOpen    = state.status !== 'idle';
  const isLoading = state.status === 'loading';
  const isError   = state.status === 'error';

  const details =
    state.status === 'confirming' ||
    state.status === 'loading'    ||
    state.status === 'error'
      ? state.details
      : null;

  const destructive  = details?.destructive ?? false;
  const confirmLabel = details?.confirmLabel ?? 'Confirm & Sign';
  const errorMsg     = state.status === 'error' ? state.message : '';

  // ── Focus management ────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
        first?.focus();
      });
    } else {
      document.body.style.overflow = '';
      previousFocus.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ── Escape key ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) _reject();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isLoading, _reject]);

  // ── Tab trap ────────────────────────────────────────────────
  const trapFocus = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // ── Backdrop click ──────────────────────────────────────────
  const handleBackdropClick = useCallback(() => {
    if (!isLoading) _reject();
  }, [isLoading, _reject]);

  if (state.status === 'idle') return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
        aria-hidden="true"
        data-testid="txmodal-backdrop"
        onClick={handleBackdropClick}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txmodal-title"
        aria-describedby="txmodal-subtitle"
        onKeyDown={trapFocus}
        data-testid="txmodal-dialog"
        className={`txmodal${destructive ? ' txmodal--destructive' : ''}`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          background: '#fff',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          maxWidth: '480px',
          width: '90vw',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        {/* ── Hero ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span aria-hidden="true" style={{ fontSize: '2rem' }}>
            {actionIcon(details?.action ?? '', destructive)}
          </span>
          <div>
            <h2
              id="txmodal-title"
              style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}
            >
              {details?.action ?? 'Confirm Transaction'}
            </h2>
            <p
              id="txmodal-subtitle"
              style={{ margin: 0, fontSize: '0.875rem', color: '#666' }}
            >
              Review carefully before signing with Freighter
            </p>
          </div>
        </div>

        {/* ── Info grid ───────────────────────────────────────── */}
        {details && (
          <dl style={{ margin: '0 0 1rem', padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <dt style={{ fontWeight: 600, fontSize: '0.875rem' }}>Target</dt>
              <dd style={{ margin: 0, fontSize: '0.875rem' }}>{details.target}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <dt style={{ fontWeight: 600, fontSize: '0.875rem' }}>Est. fee</dt>
              <dd style={{ margin: 0, fontSize: '0.875rem' }}>{details.fee}</dd>
            </div>
            {details.estimatedTime && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <dt style={{ fontWeight: 600, fontSize: '0.875rem' }}>Confirmation</dt>
                <dd style={{ margin: 0, fontSize: '0.875rem' }}>{details.estimatedTime}</dd>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <dt style={{ fontWeight: 600, fontSize: '0.875rem' }}>Network</dt>
              <dd style={{ margin: 0 }}>
                <span
                  data-testid="txmodal-network-badge"
                  style={{
                    display: 'inline-block',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: details.network === 'mainnet' ? '#15803d' : '#1d4ed8',
                    color: '#fff',
                  }}
                >
                  {details.network.toUpperCase()}
                </span>
              </dd>
            </div>
          </dl>
        )}

        {/* ── Collapsible XDR ─────────────────────────────────── */}
        {details?.xdr && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls="txmodal-xdr"
              data-testid="txmodal-xdr-toggle"
              onClick={() => setDetailsOpen(v => !v)}
              style={{
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '0.25rem',
                padding: '0.25rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Technical details (XDR) {detailsOpen ? '▲' : '▼'}
            </button>
            {detailsOpen && (
              <div id="txmodal-xdr" style={{ marginTop: '0.5rem' }}>
                <pre
                  data-testid="txmodal-xdr-content"
                  style={{
                    background: '#f5f5f5',
                    padding: '0.75rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    wordBreak: 'break-all',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {details.xdr}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── Error banner ─────────────────────────────────────── */}
        {isError && (
          <div
            role="alert"
            data-testid="txmodal-error"
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '0.375rem',
              padding: '0.75rem',
              marginBottom: '1rem',
              color: '#dc2626',
              fontSize: '0.875rem',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          {isError ? (
            <>
              <button
                type="button"
                data-testid="txmodal-dismiss"
                onClick={close}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                type="button"
                data-testid="txmodal-retry"
                onClick={_resolve}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: destructive ? '#dc2626' : '#1d4ed8',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-testid="txmodal-cancel"
                onClick={_reject}
                disabled={isLoading}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="txmodal-confirm"
                onClick={_resolve}
                disabled={isLoading}
                aria-busy={isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: destructive ? '#dc2626' : '#1d4ed8',
                  color: '#fff',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {isLoading && (
                  <span
                    data-testid="txmodal-spinner"
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '1em',
                      height: '1em',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }}
                  />
                )}
                {isLoading ? 'Signing…' : confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
