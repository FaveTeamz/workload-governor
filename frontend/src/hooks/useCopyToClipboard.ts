import { useState, useCallback, useRef } from 'react';

export interface UseCopyToClipboard {
  /** Copy `text` to the clipboard. Returns true on success, false on failure. */
  copy: (text: string) => Promise<boolean>;
  /** True for 2 seconds after a successful copy. */
  copied: boolean;
  /** Non-null when the last copy attempt failed. Clears on the next attempt. */
  error: Error | null;
}

/**
 * Copies text to the clipboard using the async Clipboard API when available,
 * falling back to `document.execCommand('copy')` for environments that lack
 * it (e.g. non-secure contexts, older browsers).
 *
 * `copied` is set to `true` for exactly 2 seconds after a successful copy,
 * then reset automatically.
 */
export function useCopyToClipboard(): UseCopyToClipboard {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    // Clear any previous error and pending timer
    setError(null);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        // Modern async Clipboard API
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: create a transient textarea and use execCommand
        fallbackCopy(text);
      }

      setCopied(true);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 2000);
      return true;
    } catch (err) {
      const copyError = err instanceof Error ? err : new Error(String(err));
      setError(copyError);
      setCopied(false);
      return false;
    }
  }, []);

  return { copy, copied, error };
}

/** execCommand fallback for browsers without navigator.clipboard */
function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;

  // Move off-screen so it isn't visible
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.setAttribute('aria-hidden', 'true');
  textarea.setAttribute('tabindex', '-1');

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const success = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!success) {
    throw new Error('execCommand copy failed');
  }
}
