'use client';

import { useEffect, useRef, useCallback, useId } from 'react';

type TxConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
};

const SWIPE_DISMISS_THRESHOLD = 80; // px — swipe down this far to dismiss

/**
 * Transaction confirmation modal.
 *
 * - Desktop (≥ 768px): centred overlay dialog
 * - Mobile (< 768px): full-screen bottom sheet that slides up from the bottom.
 *   Supports swipe-down-to-dismiss gesture (touch ≥ 80 px downward).
 *
 * Meets WCAG:
 *  - role="dialog" + aria-modal + aria-labelledby
 *  - Focus trap: first focusable element receives focus on open
 *  - All buttons ≥ 44×44 px (WCAG 2.5.5)
 *  - Escape key closes the modal
 */
export default function TxConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}: TxConfirmModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number>(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Focus the close button when the modal opens
  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Swipe-to-dismiss handlers ─────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === null) return;
    const delta = (e.touches[0]?.clientY ?? 0) - touchStartY.current;
    touchCurrentY.current = delta;

    // Only translate downward (no negative values)
    if (sheetRef.current && delta > 0) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchCurrentY.current >= SWIPE_DISMISS_THRESHOLD) {
      // Reset transform before closing so animation looks clean
      if (sheetRef.current) sheetRef.current.style.transform = '';
      onClose();
    } else {
      // Snap back
      if (sheetRef.current) sheetRef.current.style.transform = '';
    }
    touchStartY.current = null;
    touchCurrentY.current = 0;
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/*
        Desktop: centred dialog
        Mobile: bottom sheet (full width, rounded top corners, fixed to bottom)
      */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="tx-modal"
        // Bottom-sheet on mobile; centred dialog on md+
        className={[
          'fixed z-50 bg-[var(--color-bg)] shadow-xl',
          // Mobile: bottom sheet
          'inset-x-0 bottom-0 rounded-t-2xl p-6',
          // Desktop: centred card
          'md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl',
        ].join(' ')}
        // Swipe-to-dismiss (mobile only — no-op on desktop)
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle — decorative, mobile only */}
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600 md:hidden"
          aria-hidden="true"
          data-testid="modal-bottom-sheet"
        />

        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="touch-target shrink-0 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {/* ✕ icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <p className="mb-6 text-sm text-[var(--color-text-secondary)]">{description}</p>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="touch-target w-full rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="touch-target w-full rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            Confirm &amp; Submit
          </button>
        </div>
      </div>
    </>
  );
}
