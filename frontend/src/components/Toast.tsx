import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastOptions {
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  add: (message: string, type?: ToastType, options?: ToastOptions) => void;
  remove: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let _nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [visibleToasts, setVisibleToasts] = useState<Toast[]>([]);
  const [queuedToasts, setQueuedToasts] = useState<Toast[]>([]);
  const visibleRef = useRef<Toast[]>([]);
  const queuedRef = useRef<Toast[]>([]);

  const add = useCallback((message: string, type: ToastType = "info", options: ToastOptions = {}) => {
    const toast: Toast = {
      id: ++_nextId,
      message,
      type,
      duration: options.duration ?? 5000,
    };

    if (visibleRef.current.length >= 3) {
      queuedRef.current = [...queuedRef.current, toast];
      setQueuedToasts(queuedRef.current);
      return;
    }

    visibleRef.current = [...visibleRef.current, toast];
    setVisibleToasts(visibleRef.current);

    window.setTimeout(() => remove(toast.id), toast.duration);
  }, []);

  const remove = useCallback((id: number) => {
    visibleRef.current = visibleRef.current.filter((toast) => toast.id !== id);
    setVisibleToasts(visibleRef.current);

    if (queuedRef.current.length > 0) {
      const [nextToast, ...rest] = queuedRef.current;
      queuedRef.current = rest;
      setQueuedToasts(rest);
      visibleRef.current = [...visibleRef.current, nextToast];
      setVisibleToasts(visibleRef.current);
      window.setTimeout(() => remove(nextToast.id), nextToast.duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toasts: visibleToasts, add, remove }}>
      {children}
      <div
        className="toast-container"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
      >
        {visibleToasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const liveRole = toast.type === "error" ? "alert" : "status";
  const liveValue = toast.type === "error" ? "assertive" : "polite";

  return (
    <div
      ref={ref}
      role={liveRole}
      aria-live={liveValue}
      className={`toast toast-${toast.type}`}
      tabIndex={-1}
      aria-busy={toast.type === "pending"}
    >
      {toast.type === "pending" && (
        <span className="toast-spinner" aria-hidden="true" />
      )}
      <span>{toast.message}</span>
      <button
        className="toast-close"
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
        type="button"
      >
        ✕
      </button>
    </div>
  );
}
