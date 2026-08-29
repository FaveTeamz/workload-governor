/**
 * OrgSelector — searchable dropdown for filtering the issue list by organisation.
 *
 * - Fetches org list from GET /api/orgs on mount
 * - Filters orgs in real-time as the user types
 * - Keyboard navigable: ↑/↓ move through options, Enter selects, Escape closes
 * - Persists selected org in the URL query param ?org=
 * - Follows ARIA combobox pattern (role="combobox" + role="listbox")
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "react-router-dom";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Org {
  id: string;
  name: string;
  avatarUrl?: string;
  activeIssueCount: number;
}

interface OrgSelectorProps {
  /** API base URL — defaults to "/api" */
  apiBase?: string;
  /** Called when selection changes. Receives org id or "" for All Orgs. */
  onSelect?: (orgId: string) => void;
  /** Injected for testing. Skips fetch when provided. */
  orgs?: Org[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_ORGS_OPTION: Org = {
  id: "",
  name: "All Orgs",
  activeIssueCount: 0,
};

function OrgAvatar({ org }: { org: Org }) {
  if (org.avatarUrl) {
    return (
      <img
        src={org.avatarUrl}
        alt=""
        className="org-selector__avatar"
        aria-hidden="true"
        width={24}
        height={24}
      />
    );
  }
  // Fallback: first letter monogram
  return (
    <span className="org-selector__avatar org-selector__avatar--fallback" aria-hidden="true">
      {org.name.charAt(0).toUpperCase()}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OrgSelector({ apiBase = "/api", onSelect, orgs: propOrgs }: OrgSelectorProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOrgId = searchParams.get("org") ?? "";

  const [orgs, setOrgs] = useState<Org[]>(propOrgs ?? []);
  const [loading, setLoading] = useState(!propOrgs);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedOrg, setSelectedOrg] = useState<Org>(ALL_ORGS_OPTION);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const listboxId = useId();
  const inputId = useId();

  // Fetch orgs from API unless injected
  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/orgs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { orgs: Org[] };
      setOrgs(data.orgs ?? []);
    } catch {
      // silently fall back to empty list
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!propOrgs) void fetchOrgs();
  }, [propOrgs, fetchOrgs]);

  useEffect(() => {
    if (propOrgs) setOrgs(propOrgs);
  }, [propOrgs]);

  // Resolve initial org from URL param
  useEffect(() => {
    if (!initialOrgId) return;
    const found = orgs.find((o) => o.id === initialOrgId);
    if (found) {
      setSelectedOrg(found);
      setQuery(found.name);
    }
  }, [initialOrgId, orgs]);

  // ── Filtered options ────────────────────────────────────────────────────────

  const filtered: Org[] = [
    ALL_ORGS_OPTION,
    ...orgs.filter((o) =>
      o.name.toLowerCase().includes(query.toLowerCase()) ||
      o.id.toLowerCase().includes(query.toLowerCase())
    ),
  ];

  // ── Selection ────────────────────────────────────────────────────────────────

  function selectOrg(org: Org) {
    setSelectedOrg(org);
    setQuery(org.id === "" ? "" : org.name);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();

    // Update URL
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (org.id) {
        next.set("org", org.id);
      } else {
        next.delete("org");
      }
      return next;
    }, { replace: true });

    onSelect?.(org.id);
  }

  // ── Keyboard navigation ──────────────────────────────────────────────────────

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(0);
        } else {
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;

      case "Enter":
        e.preventDefault();
        if (open && activeIndex >= 0 && activeIndex < filtered.length) {
          selectOrg(filtered[activeIndex]);
        } else {
          setOpen((o) => !o);
        }
        break;

      case "Escape":
        e.preventDefault();
        if (open) {
          setOpen(false);
          setActiveIndex(-1);
          // Restore display value to current selection
          setQuery(selectedOrg.id === "" ? "" : selectedOrg.name);
        }
        break;

      case "Tab":
        setOpen(false);
        break;
    }
  }

  // Scroll active option into view
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const items = listboxRef.current?.querySelectorAll<HTMLLIElement>("[role='option']");
    items?.[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
        setQuery(selectedOrg.id === "" ? "" : selectedOrg.name);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedOrg]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const displayValue = open ? query : (selectedOrg.id === "" ? "" : selectedOrg.name);
  const placeholder = loading ? "Loading organisations…" : "Search or select an org…";

  return (
    <div
      ref={containerRef}
      className="org-selector"
      data-open={open}
    >
      <label htmlFor={inputId} className="org-selector__label">
        Organisation
      </label>

      <div className="org-selector__control" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-owns={listboxId}>
        {selectedOrg.id && !open && (
          <OrgAvatar org={selectedOrg} />
        )}
        <input
          ref={inputRef}
          id={inputId}
          className="org-selector__input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          value={displayValue}
          placeholder={placeholder}
          disabled={loading}
          aria-label="Search organisations"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeIndex >= 0
              ? `org-option-${filtered[activeIndex]?.id ?? "all"}`
              : undefined
          }
          aria-expanded={open}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          className="org-selector__chevron"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => {
            setOpen((o) => !o);
            if (!open) inputRef.current?.focus();
          }}
          type="button"
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {open && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          className="org-selector__listbox"
          aria-label="Organisations"
        >
          {filtered.length === 0 ? (
            <li className="org-selector__no-results" role="option" aria-selected={false}>
              No organisations match "{query}"
            </li>
          ) : (
            filtered.map((org, idx) => (
              <li
                key={org.id || "__all__"}
                id={`org-option-${org.id || "all"}`}
                role="option"
                className={[
                  "org-selector__option",
                  idx === activeIndex ? "org-selector__option--active" : "",
                  selectedOrg.id === org.id ? "org-selector__option--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-selected={selectedOrg.id === org.id}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent input blur before click
                  selectOrg(org);
                }}
              >
                <OrgAvatar org={org} />
                <span className="org-selector__option-name">
                  {org.id === "" ? <em>All Orgs</em> : org.name}
                </span>
                {org.id !== "" && (
                  <span
                    className="org-selector__issue-count"
                    aria-label={`${org.activeIssueCount} active issues`}
                  >
                    {org.activeIssueCount}
                  </span>
                )}
                {selectedOrg.id === org.id && (
                  <span className="org-selector__checkmark" aria-hidden="true">✓</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
