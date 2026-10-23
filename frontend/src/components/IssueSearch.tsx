/**
 * IssueSearch — closes #811
 *
 * Debounced search input for filtering open issues.
 *
 * The debounce interval is exposed as the `debounceMs` prop (default: 300 ms)
 * so callers can tune it per use-case and tests can use 0 ms to avoid
 * relying on real timers.
 *
 * Usage:
 *   <IssueSearch onSearch={(q) => setQuery(q)} />
 *
 * In tests:
 *   <IssueSearch onSearch={handler} debounceMs={0} />
 */

import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IssueSearchProps {
  /** Called with the trimmed search query after the debounce interval elapses. */
  onSearch: (query: string) => void;
  /**
   * Debounce delay in milliseconds.
   * Pass `0` in tests for synchronous behaviour without fake timers.
   * @default 300
   */
  debounceMs?: number;
  /** Input placeholder text. @default 'Search issues…' */
  placeholder?: string;
  /** Optional CSS class applied to the wrapper element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IssueSearch({
  onSearch,
  debounceMs = 300,
  placeholder = 'Search issues…',
  className,
}: IssueSearchProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timer before scheduling a new one
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      onSearch(value);
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, debounceMs, onSearch]);

  return (
    <div className={`issue-search${className ? ` ${className}` : ''}`}>
      <input
        type="search"
        aria-label="Search issues"
        className="issue-search__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
}
