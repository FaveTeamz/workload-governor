import type { ButtonHTMLAttributes } from 'react';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

export interface CopyButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  /** The text to copy to the clipboard. */
  text: string;
  /**
   * Accessible label for the button before copying.
   * @default "Copy"
   */
  label?: string;
  /**
   * Accessible label shown while the copied state is active.
   * @default "Copied"
   */
  copiedLabel?: string;
  /**
   * Accessible label shown while an error state is active.
   * @default "Copy failed"
   */
  errorLabel?: string;
}

/**
 * An icon button that copies `text` to the clipboard.
 *
 * - Shows a copy icon at rest, a check icon for 2 seconds after success.
 * - Announces success to screen readers via an `aria-live="polite"` region.
 * - Shows an error indicator if the copy fails (e.g. permission denied).
 * - Supports all standard button HTML attributes except `onClick` and `children`.
 */
export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  errorLabel = 'Copy failed',
  className = '',
  title,
  'aria-label': ariaLabel,
  ...rest
}: CopyButtonProps) {
  const { copy, copied, error } = useCopyToClipboard();

  const effectiveLabel = error ? errorLabel : copied ? copiedLabel : label;
  const effectiveTitle = title ?? effectiveLabel;
  const effectiveAriaLabel = ariaLabel ?? effectiveLabel;

  return (
    <>
      <button
        type="button"
        className={['copy-btn', copied ? 'copy-btn--copied' : '', error ? 'copy-btn--error' : '', className]
          .filter(Boolean)
          .join(' ')}
        title={effectiveTitle}
        aria-label={effectiveAriaLabel}
        onClick={() => copy(text)}
        {...rest}
      >
        {copied ? <CheckIcon /> : error ? <ErrorIcon /> : <CopyIcon />}
      </button>

      {/*
       * aria-live region: always in the DOM so assistive technologies
       * register it before it gets populated. Content updates trigger
       * an announcement on success or failure.
       */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="copy-btn__announce"
        // Visually hidden but readable by screen readers
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {copied ? copiedLabel : error ? `${errorLabel}: ${error.message}` : ''}
      </span>
    </>
  );
}

// ── SVG icons ────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Back page */}
      <rect x="9" y="9" width="13" height="13" rx="2" />
      {/* Front page */}
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
