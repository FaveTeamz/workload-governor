import React, { useEffect, useRef, useState } from 'react';
import type { ToastItem } from '../context/ToastContext';

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastItem['type'], string> = {
  success: 'border-green-500 bg-green-50 text-green-900',
  error: 'border-red-500 bg-red-50 text-red-900',
  warning: 'border-yellow-500 bg-yellow-50 text-yellow-900',
  info: 'border-blue-500 bg-blue-50 text-blue-900',
};

const BAR_STYLES: Record<ToastItem['type'], string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
};

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(toast.duration);
  const startRef = useRef<number>(Date.now());
  const remainingRef = useRef<number>(toast.duration);

  useEffect(() => {
    if (toast.duration <= 0) return;

    if (paused) {
      remainingRef.current = remaining;
      return;
    }

    startRef.current = Date.now();
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, remainingRef.current);

    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.duration, onDismiss, remaining]);

  const handleMouseEnter = () => {
    setRemaining(Math.max(0, remainingRef.current - (Date.now() - startRef.current)));
    setPaused(true);
  };

  const handleMouseLeave = () => setPaused(false);

  const ariaLive = toast.type === 'error' ? 'assertive' : 'polite';

  return (
    <div
      role="alert"
      aria-live={ariaLive}
      aria-atomic="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative w-80 overflow-hidden rounded-md border-l-4 p-4 shadow-lg ${TYPE_STYLES[toast.type]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.message && <p className="mt-1 break-words text-xs">{toast.message}</p>}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Close notification"
          className="shrink-0 rounded p-1 text-current opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
        >
          <span aria-hidden="true">&#10005;</span>
        </button>
      </div>
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 h-1 w-full bg-black/10">
          <div
            className={`h-full ${BAR_STYLES[toast.type]}`}
            style={{
              animation: `toast-countdown ${toast.duration}ms linear forwards`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </div>
  );
};
