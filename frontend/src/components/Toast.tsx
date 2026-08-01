import { useState, useCallback, useEffect, useRef } from "react";

export type ToastType = "success" | "error" | "info" | "pending";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let _nextId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track timeout handles so we can cancel them when a toast is updated
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (message: string, type: ToastType = "info"): number => {
      const id = ++_nextId;
      setToasts((prev) => [...prev, { id, message, type }]);

      // Pending toasts stay until explicitly updated/removed
      if (type !== "pending") {
        const handle = setTimeout(() => {
          timers.current.delete(id);
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
        timers.current.set(id, handle);
      }

      return id;
    },
    []
  );

  /**
   * Replace a pending toast (by id) with a resolved success/error/info toast.
   * The resolved toast auto-dismisses after 4 s.
   */
  const update = useCallback(
    (id: number, message: string, type: Exclude<ToastType, "pending">) => {
      // Cancel any existing timer for this id (shouldn't exist for pending, but
      // guard anyway)
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);

      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, message, type } : t))
      );

      const handle = setTimeout(() => {
        timers.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
      timers.current.set(id, handle);
    },
    []
  );

  return { toasts, add, update, remove };
}

interface Props {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

export function ToastContainer({ toasts, onRemove }: Props) {
  return (
    // aria-live="assertive" so screen readers announce immediately
    <div
      className="toast-container"
      role="region"
      aria-label="Notifications"
      aria-live="assertive"
      aria-atomic="false"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="alert"
      className={`toast toast-${toast.type}`}
      tabIndex={-1}
      aria-busy={toast.type === "pending"}
    >
      {toast.type === "pending" && (
        <span className="toast-spinner" aria-hidden="true" />
      )}
      <span>{toast.message}</span>
      {/* Don't show dismiss button on pending — it will be replaced */}
      {toast.type !== "pending" && (
        <button
          className="toast-close"
          onClick={() => onRemove(toast.id)}
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      )}
    </div>
  );
}
