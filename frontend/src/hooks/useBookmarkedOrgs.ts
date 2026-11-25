import { useCallback, useEffect, useState } from "react";

/**
 * Org bookmarks persisted in localStorage (#1264).
 *
 * Shares the `wg_bookmarked_orgs` key with `useOrgBookmarks`, so both hooks
 * see the same list. Changes made in another tab are picked up through the
 * `storage` event, and a corrupted or unavailable store degrades to "no
 * bookmarks" instead of throwing.
 */
export const BOOKMARKS_STORAGE_KEY = "wg_bookmarked_orgs";

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Quota exceeded or storage disabled: keep the in-memory list.
  }
}

export interface UseBookmarkedOrgs {
  /** Bookmarked org ids, oldest first. */
  bookmarkedOrgs: string[];
  isBookmarked: (orgId: string) => boolean;
  /** Adds the org if absent, removes it if present. */
  toggleBookmark: (orgId: string) => void;
}

export function useBookmarkedOrgs(): UseBookmarkedOrgs {
  const [bookmarkedOrgs, setBookmarkedOrgs] = useState<string[]>(read);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === BOOKMARKS_STORAGE_KEY || event.key === null) setBookmarkedOrgs(read());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isBookmarked = useCallback((orgId: string) => bookmarkedOrgs.includes(orgId), [bookmarkedOrgs]);

  const toggleBookmark = useCallback((orgId: string) => {
    setBookmarkedOrgs((prev) => {
      const next = prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId];
      write(next);
      return next;
    });
  }, []);

  return { bookmarkedOrgs, isBookmarked, toggleBookmark };
}
