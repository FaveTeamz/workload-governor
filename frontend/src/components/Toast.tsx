/**
 * Toast notification system — closes #649
 *
 * - ToastProvider context so useToast() works anywhere in the tree
 * - Variants: success | error | warning | info
 * - Auto-dismiss after 5 s; dismissable by click or keyboard (Escape / Enter)
 * - Stack limit: 3 toasts max (oldest dropped when 4th arrives)
 * - Bottom-right positioning; slide-in from right, fade-out on dismiss
 * - ARIA: role=alert + aria-live=assertive for errors,
 *          role=status + aria-live=polite for success / warning / info
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";
import "./Toast.css";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  /** true while the dismiss-animation is playing */
  dismissing?: boolean;
}

interface ToastContextValue {
  add: (message: string, variant?: ToastVariant) => void;
  remove: (id: number) => void;
  toasts: Toast[];
}

// ─── Context ────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

const STACK_LIMIT = 3;
const DISMISS_DELAY_MS = 5_000;
const ANIMATION_MS = 300;

let _nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const startDismissTimer = useCallback((id: number) => {
    const timer = setTimeout(() => remove(id), DISMISS_DELAY_MS);
    timers.current.set(id, timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback((id: number) => {
    // Play exit animation, then remove from state
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, ANIMATION_MS);
  }, []);

  const add = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++_nextId;
      setToasts((prev) => {
        const next = [...prev, { id, message, variant }];
        // Drop oldest entries beyond the stack limit
        if (next.length > STACK_LIMIT) {
          const dropped = next.splice(0, next.length - STACK_LIMIT);
          dropped.forEach((t) => {
            const existing = timers.current.get(t.id);
            if (existing) clearTimeout(existing);
            timers.current.delete(t.id);
          });
        }
        return next;
      });
      startDismissTimer(id);
    },
    [startDismissTimer]
  );

  return (
    <ToastContext.Provider value={{ add, remove, toasts }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useToast(): Pick<ToastContextValue, "add"> {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback for components rendered outside ToastProvider (e.g. Storybook)
    const noop = () => {};
    return { add: noop };
  }
  return { add: ctx.add };
}

// ─── Container ──────────────────────────────────────────────────────────────

interface ContainerProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

export function ToastContainer({ toasts, onRemove }: ContainerProps) {
  // Error toasts use assertive; everything else uses polite
  const hasError = toasts.some((t) => t.variant === "error");

  return (
    <div
      className="toast-container"
      role="region"
      aria-label="Notifications"
      aria-live={hasError ? "assertive" : "polite"}
      aria-atomic="false"
      aria-relevant="additions removals"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ─── Toast item ─────────────────────────────────────────────────────────────

const VARIANT_META: Record<
  ToastVariant,
  { iconName: "check-circle" | "error" | "warning" | "info"; ariaRole: "alert" | "status" }
> = {
  success: { iconName: "check-circle", ariaRole: "status" },
  error:   { iconName: "error",        ariaRole: "alert"  },
  warning: { iconName: "warning",      ariaRole: "status" },
  info:    { iconName: "info",         ariaRole: "status" },
};

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: number) => void;
}) {
  const { iconName, ariaRole } = VARIANT_META[toast.variant];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      onRemove(toast.id);
    }
  }

  return (
    <div
      role={ariaRole}
      className={`toast toast--${toast.variant}${toast.dismissing ? " toast--dismissing" : " toast--entering"}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${toast.variant}: ${toast.message}`}
    >
      <span className="toast__icon" aria-hidden="true">
        <Icon name={iconName} size="sm" />
      </span>
      <span className="toast__message">{toast.message}</span>
      <button
        className="toast__close"
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
        type="button"
      >
        <Icon name="close" size="xs" />
      </button>
    </div>
  );
}
