/**
 * #1264: org bookmarks persisted in localStorage and pinned in the org picker.
 */
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { BOOKMARKS_STORAGE_KEY, useBookmarkedOrgs } from './useBookmarkedOrgs';
import { OrgSelector, type Org } from '../components/OrgSelector';

beforeEach(() => localStorage.clear());

describe('useBookmarkedOrgs', () => {
  it('toggles bookmarks and persists them under wg_bookmarked_orgs', () => {
    const { result } = renderHook(() => useBookmarkedOrgs());
    expect(result.current.bookmarkedOrgs).toEqual([]);

    act(() => result.current.toggleBookmark('stellar-org'));
    expect(result.current.isBookmarked('stellar-org')).toBe(true);
    expect(JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY)!)).toEqual(['stellar-org']);

    act(() => result.current.toggleBookmark('stellar-org'));
    expect(result.current.isBookmarked('stellar-org')).toBe(false);
    expect(JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY)!)).toEqual([]);
  });

  it('restores bookmarks on load and ignores corrupted storage', () => {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(['a', 42, 'b']));
    expect(renderHook(() => useBookmarkedOrgs()).result.current.bookmarkedOrgs).toEqual(['a', 'b']);

    localStorage.setItem(BOOKMARKS_STORAGE_KEY, '{not json');
    expect(renderHook(() => useBookmarkedOrgs()).result.current.bookmarkedOrgs).toEqual([]);
  });

  it('picks up changes made in another tab', () => {
    const { result } = renderHook(() => useBookmarkedOrgs());
    act(() => {
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(['other-tab-org']));
      window.dispatchEvent(new StorageEvent('storage', { key: BOOKMARKS_STORAGE_KEY }));
    });
    expect(result.current.bookmarkedOrgs).toEqual(['other-tab-org']);
  });
});

describe('OrgSelector bookmarks', () => {
  const orgs: Org[] = [
    { id: 'alpha', name: 'Alpha', activeIssueCount: 1 },
    { id: 'beta', name: 'Beta', activeIssueCount: 2 },
    { id: 'gamma', name: 'Gamma', activeIssueCount: 3 },
  ];

  function open() {
    render(
      <MemoryRouter>
        <OrgSelector orgs={orgs} />
      </MemoryRouter>,
    );
    fireEvent.focus(screen.getByRole('combobox'));
  }

  const optionNames = () =>
    screen.getAllByRole('option').map((o) => o.querySelector('.org-selector__option-name')?.textContent);

  it('pins a bookmarked org under "Favorite Organizations" and persists it', () => {
    open();
    expect(screen.queryByText('Favorite Organizations')).toBeNull();
    expect(optionNames()).toEqual(['All Orgs', 'Alpha', 'Beta', 'Gamma']);

    const gammaStar = screen.getAllByRole('button', { name: 'Bookmark organization' })[2];
    expect(gammaStar.getAttribute('aria-pressed')).toBe('false');
    fireEvent.mouseDown(gammaStar);

    expect(screen.getByText('Favorite Organizations')).toBeTruthy();
    expect(optionNames()).toEqual(['All Orgs', 'Gamma', 'Alpha', 'Beta']);
    expect(JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY)!)).toEqual(['gamma']);
    // Toggling a bookmark does not select the org.
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('false');
  });
});
