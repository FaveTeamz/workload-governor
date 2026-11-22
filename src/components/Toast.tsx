/**
 * Toast.tsx
 *
 * Fix #1060 – Toast notification queue with auto-dismiss countdown timer.
 *
 * Features
 * ────────
 * • Queue up to 3 concurrent stacked notifications (oldest at bottom).
 * • Each toast shows a visual countdown progress bar that depletes over
 *   the dismiss duration (default 5 s).
 * • Hovering a toast pauses its timer so users can read it.
 * • Provides a `useToast` hook and a `ToastProvider` context for app-wide use.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Auto-dismiss after this many milliseconds (default 5000). */
  duration: number;
}

export interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  addToast: (message: string, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
};

// ─── Styling constants ────────────────────────────────────────────────────────

const MAX_QUEUE = 3;
const DEFAULT_DURATION = 5000; // ms

const VARIANT_COLORS: Record<ToastVariant, { bg: string; bar: string; icon: string }> = {
  info:    { bg: '#eff6ff', bar: '#3b82f6', icon: 'ℹ️' },
  success: { bg: '#f0fdf4', bar: '#22c55e', icon: '✅' },
  warning: { bg: '#fffbeb', bar: '#f59e0b', icon: '⚠️' },
  error:   { bg: '#fef2f2', bar: '#ef4444', icon: '❌' },
};

// ─── Single Toast component ───────────────────────────────────────────────────

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss }) => {
  const { id, message, variant, duration } = toast;
  const colors = VARIANT_COLORS[variant];

  // remaining time as a fraction 0–1 (1 = full, 0 = dismissed)
  const [progress, setProgress] = useState(1);
  const pausedRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const elapsedRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    if (!pausedRef.current) {
      const now = Date.now();
      const total = elapsedRef.current + (now - startTimeRef.current);
      const fraction = Math.max(0, 1 - total / duration);
      setProgress(fraction);
      if (fraction <= 0) {
        onDismiss(id);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, id, onDismiss]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  const handleMouseEnter = () => {
    pausedRef.current = true;
    elapsedRef.current += Date.now() - startTimeRef.current;
  };

  const handleMouseLeave = () => {
    startTimeRef.current = Date.now();
    pausedRef.current = false;
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        minWidth: 280,
        maxWidth: 380,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.bar}`,
        borderRadius: 8,
        padding: '12px 36px 8px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        marginTop: 8,
        boxSizing: 'border-box',
      }}
    >
      {/* Message row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 16 }}>
          {colors.icon}
        </span>
        <span
          style={{
            fontSize: 14,
            color: '#1e293b',
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}
        >
          {message}
        </span>
      </div>

      {/* Dismiss button */}
      <button
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          color: '#64748b',
          padding: 2,
        }}
      >
        ×
      </button>

      {/* Countdown progress bar */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 3,
          width: `${progress * 100}%`,
          backgroundColor: colors.bar,
          borderRadius: '0 0 0 8px',
          transition: 'none',
        }}
      />
    </div>
  );
};

// ─── ToastProvider ────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  // useId provides a stable prefix; we append a counter for uniqueness.
  const baseId = useId();
  const counterRef = useRef(0);

  const addToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const { variant = 'info', duration = DEFAULT_DURATION } = options;
      const id = `${baseId}-${++counterRef.current}`;

      setQueue((prev) => {
        const next = [...prev, { id, message, variant, duration }];
        // Keep only the most-recent MAX_QUEUE toasts
        return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next;
      });
    },
    [baseId],
  );

  const removeToast = useCallback((id: string) => {
    setQueue((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}

      {/* Portal-style fixed stack */}
      <div
        aria-label="Notifications"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column-reverse', // newest on top
          alignItems: 'flex-end',
        }}
      >
        {queue.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// ─── Default export ───────────────────────────────────────────────────────────
export default ToastProvider;
