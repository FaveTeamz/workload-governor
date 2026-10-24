import { useState, useEffect } from "react";

const STORAGE_KEY = "wg_bookmarked_orgs";

function readStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
    return [];
  } catch {
    // Corrupted localStorage — reset gracefully
    return [];
  }
}

function writeStorage(bookmarks: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

export interface UseOrgBookmarks {
  /** Currently bookmarked org IDs */
  bookmarks: string[];
  /** Add an org to bookmarks (no-op if already present) */
  add: (org: string) => void;
  /** Remove an org from bookmarks (no-op if not present) */
  remove: (org: string) => void;
  /** Clear all bookmarks */
  clear: () => void;
}

/**
 * Persists a list of bookmarked org IDs to localStorage.
 * Restores bookmarks on initial page load (offline-capable).
 */
export function useOrgBookmarks(): UseOrgBookmarks {
  const [bookmarks, setBookmarks] = useState<string[]>(() => readStorage());

  // Sync to localStorage whenever bookmarks change
  useEffect(() => {
    writeStorage(bookmarks);
  }, [bookmarks]);

  function add(org: string) {
    setBookmarks((prev) =>
      prev.includes(org) ? prev : [...prev, org]
    );
  }

  function remove(org: string) {
    setBookmarks((prev) => prev.filter((o) => o !== org));
  }

  function clear() {
    setBookmarks([]);
  }

  return { bookmarks, add, remove, clear };
}
