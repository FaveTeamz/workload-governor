import { useState, useEffect, useRef, useCallback, useId } from "react";
import Fuse, { type FuseResult, type FuseResultMatch } from "fuse.js";
import "./IssueSearch.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchableIssue {
  id: number | string;
  org_id: string;
  title: string;
  status: string;
}

export interface IssueSearchProps {
  /** Local dataset to fuzzy-search over */
  issues?: SearchableIssue[];
  /** Called when the user selects a result. null means "browse all" */
  onSelect?: (issue: SearchableIssue | null) => void;
  /** Base URL for server-side search (e.g. "/api"). Triggered when query > 3 chars */
  apiBase?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render a string with Fuse.js match indices highlighted as <mark> elements */
function highlightMatches(
  text: string,
  indices?: ReadonlyArray<[number, number]>,
): React.ReactNode {
  if (!indices || indices.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const [start, end] of indices) {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(<mark key={`${start}-${end}`}>{text.slice(start, end + 1)}</mark>);
    last = end + 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Deduplicate issues by id — server results merged after local fuse results */
function dedup(items: SearchableIssue[]): SearchableIssue[] {
  const seen = new Set<string | number>();
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IssueSearch({ issues = [], onSelect, apiBase = "/api" }: IssueSearchProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [serverResults, setServerResults] = useState<SearchableIssue[]>([]);
  const [open, setOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(query, 200);
  const listboxId = useId();
  const inputId = useId();

  // ---- Fuse.js instance (memoised when issues list changes) ----
  const fuse = useRef<Fuse<SearchableIssue>>(
    new Fuse<SearchableIssue>(issues, {
      keys: ["title", "org_id", { name: "id", getFn: (o) => String(o.id) }],
      threshold: 0.4,
      includeMatches: true,
      minMatchCharLength: 1,
    }),
  );
  useEffect(() => {
    fuse.current = new Fuse(issues, {
      keys: ["title", "org_id", { name: "id", getFn: (o) => String(o.id) }],
      threshold: 0.4,
      includeMatches: true,
      minMatchCharLength: 1,
    });
  }, [issues]);

  // ---- Local fuzzy results ----
  const [fuseResults, setFuseResults] = useState<FuseResult<SearchableIssue>[]>([]);

  useEffect(() => {
    if (!debouncedQuery) {
      setFuseResults([]);
      setServerResults([]);
      setOpen(false);
      return;
    }
    const results = fuse.current.search(debouncedQuery, { limit: 10 });
    setFuseResults(results);
    setOpen(true);
  }, [debouncedQuery]);

  // ---- Server-side fetch for queries > 3 chars ----
  useEffect(() => {
    if (debouncedQuery.length <= 3) {
      setServerResults([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);

    fetch(
      `${apiBase}/issues?search=${encodeURIComponent(debouncedQuery)}&limit=20`,
      { signal: abortRef.current.signal },
    )
      .then((r) => r.json())
      .then((data) => {
        const items: SearchableIssue[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.issues)
          ? data.issues
          : [];
        setServerResults(items);
        setLoading(false);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setLoading(false);
        }
      });

    return () => abortRef.current?.abort();
  }, [debouncedQuery, apiBase]);

  // ---- Merged deduplicated results ----
  const localItems = fuseResults.map((r) => r.item);
  const merged = dedup([...localItems, ...serverResults]);

  // Build match map for rendering highlights
  const matchMap = new Map<string | number, Record<string, FuseResultMatch>>();
  for (const r of fuseResults) {
    const m: Record<string, FuseResultMatch> = {};
    for (const match of r.matches ?? []) {
      if (match.key) m[match.key] = match;
    }
    matchMap.set(r.item.id, m);
  }

  // ---- Keyboard navigation ----
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, merged.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && merged[activeIndex]) {
        select(merged[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function select(issue: SearchableIssue) {
    onSelect?.(issue);
    close();
  }

  function close() {
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    setFuseResults([]);
    setServerResults([]);
  }

  // ---- Global "/" shortcut to focus input ----
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.isContentEditable;
    if (e.key === "/" && !isTyping) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeIndex]);

  const showDropdown = open && query.length > 0;
  const showEmpty = showDropdown && !loading && merged.length === 0;

  return (
    <div className="issue-search" role="search" aria-label="Issue search">
      <div className="issue-search__wrapper">
        <span className="issue-search__icon" aria-hidden="true">🔍</span>

        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className="issue-search__input"
          placeholder="Search issues… (press / to focus)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query) setOpen(true); }}
          onBlur={(e) => {
            // Delay to allow click on items to fire first
            if (!e.currentTarget.closest(".issue-search")?.contains(e.relatedTarget as Node)) {
              setTimeout(() => setOpen(false), 150);
            }
          }}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-item-${activeIndex}` : undefined
          }
          aria-label="Search issues"
          autoComplete="off"
          spellCheck={false}
        />

        {loading && (
          <span className="issue-search__spinner" role="status" aria-label="Loading search results">
            <span className="issue-search__spinner-ring" />
          </span>
        )}

        {!loading && !query && (
          <span className="issue-search__hint" aria-hidden="true">/</span>
        )}
      </div>

      {showDropdown && (
        <div
          className="issue-search__dropdown"
          role="listbox"
          id={listboxId}
          aria-label="Search results"
        >
          {showEmpty ? (
            <div className="issue-search__empty">
              No issues found for &ldquo;{query}&rdquo;.{" "}
              <button
                type="button"
                className="issue-search__empty a"
                onClick={() => { onSelect?.(null); close(); }}
              >
                Browse all issues
              </button>
            </div>
          ) : (
            <ul ref={listRef} style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {merged.map((issue, idx) => {
                const matches = matchMap.get(issue.id);
                const titleMatch = matches?.["title"];
                const orgMatch = matches?.["org_id"];
                const isActive = idx === activeIndex;

                return (
                  <li
                    key={issue.id}
                    id={`${listboxId}-item-${idx}`}
                    role="option"
                    aria-selected={isActive}
                  >
                    <button
                      type="button"
                      className={`issue-search__item${isActive ? " issue-search__item--active" : ""}`}
                      onMouseDown={(e) => {
                        // Prevent blur before click registers
                        e.preventDefault();
                        select(issue);
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <span className="issue-search__item-title">
                        {highlightMatches(issue.title, titleMatch?.indices as [number, number][] | undefined)}
                      </span>
                      <span className="issue-search__item-meta">
                        <span className="issue-search__item-org">
                          {highlightMatches(issue.org_id, orgMatch?.indices as [number, number][] | undefined)}
                        </span>
                        <span>#{issue.id}</span>
                        <span>{issue.status}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
