import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrgSelector, type Org } from '../../frontend/src/components/OrgSelector';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORGS: Org[] = [
  { id: 'stellar-org', name: 'Stellar Org', assignmentCount: 1 },
  { id: 'meridian-dao', name: 'Meridian DAO', assignmentCount: 0 },
  { id: 'soroban-labs', name: 'Soroban Labs', assignmentCount: 3 },
  { id: 'horizon-dev', name: 'Horizon Dev', assignmentCount: 2 },
  { id: 'anchor-net', name: 'Anchor Net', assignmentCount: 0 },
];

const STORAGE_KEY = 'test_recent_orgs';

function renderSelector(overrides: Partial<React.ComponentProps<typeof OrgSelector>> = {}) {
  const onChange = vi.fn();
  const result = render(
    <OrgSelector
      orgs={ORGS}
      value={null}
      onChange={onChange}
      storageKey={STORAGE_KEY}
      {...overrides}
    />
  );
  return { ...result, onChange };
}

function openDropdown() {
  fireEvent.click(screen.getByTestId('org-selector-trigger'));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrgSelector', () => {

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the trigger button', () => {
    renderSelector();
    expect(screen.getByTestId('org-selector-trigger')).toBeTruthy();
  });

  it('shows placeholder text when no value is selected', () => {
    renderSelector();
    expect(screen.getByText('Select an organisation')).toBeTruthy();
  });

  it('shows selected org name in trigger', () => {
    renderSelector({ value: 'stellar-org' });
    expect(screen.getByText('Stellar Org')).toBeTruthy();
  });

  it('dropdown is hidden before trigger click', () => {
    renderSelector();
    expect(screen.queryByTestId('org-selector-dropdown')).toBeNull();
  });

  it('dropdown opens on trigger click', () => {
    renderSelector();
    openDropdown();
    expect(screen.getByTestId('org-selector-dropdown')).toBeTruthy();
  });

  it('dropdown closes on second trigger click', () => {
    renderSelector();
    openDropdown();
    fireEvent.click(screen.getByTestId('org-selector-trigger'));
    expect(screen.queryByTestId('org-selector-dropdown')).toBeNull();
  });

  it('trigger has aria-expanded=false when closed', () => {
    renderSelector();
    expect(
      screen.getByTestId('org-selector-trigger').getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('trigger has aria-expanded=true when open', () => {
    renderSelector();
    openDropdown();
    expect(
      screen.getByTestId('org-selector-trigger').getAttribute('aria-expanded')
    ).toBe('true');
  });

  // ── Search / filtering ───────────────────────────────────────────────────

  it('shows all orgs when search is empty', () => {
    renderSelector();
    openDropdown();
    ORGS.forEach((o) => {
      expect(screen.getByTestId(`org-option-${o.id}`)).toBeTruthy();
    });
  });

  it('filters orgs by name in real time', () => {
    renderSelector();
    openDropdown();
    fireEvent.change(screen.getByTestId('org-selector-input'), {
      target: { value: 'stellar' },
    });
    expect(screen.getByTestId('org-option-stellar-org')).toBeTruthy();
    expect(screen.queryByTestId('org-option-meridian-dao')).toBeNull();
  });

  it('filters orgs by id (case-insensitive)', () => {
    renderSelector();
    openDropdown();
    fireEvent.change(screen.getByTestId('org-selector-input'), {
      target: { value: 'MERIDIAN' },
    });
    expect(screen.getByTestId('org-option-meridian-dao')).toBeTruthy();
    expect(screen.queryByTestId('org-option-stellar-org')).toBeNull();
  });

  it('shows empty state when no orgs match search', () => {
    renderSelector();
    openDropdown();
    fireEvent.change(screen.getByTestId('org-selector-input'), {
      target: { value: 'zzznomatch' },
    });
    expect(screen.getByTestId('org-selector-empty')).toBeTruthy();
  });

  // ── Assignment count display ──────────────────────────────────────────────

  it('renders assignment count next to org name', () => {
    renderSelector();
    openDropdown();
    // "1/4" for stellar-org
    expect(screen.getByLabelText('1 of 4 assignments')).toBeTruthy();
  });

  // ── Selection ────────────────────────────────────────────────────────────

  it('calls onChange with the selected org', () => {
    const { onChange } = renderSelector();
    openDropdown();
    fireEvent.click(screen.getByTestId('org-option-meridian-dao'));
    expect(onChange).toHaveBeenCalledWith(ORGS[1]);
  });

  it('closes dropdown after selection', () => {
    renderSelector();
    openDropdown();
    fireEvent.click(screen.getByTestId('org-option-stellar-org'));
    expect(screen.queryByTestId('org-selector-dropdown')).toBeNull();
  });

  // ── Recent orgs ──────────────────────────────────────────────────────────

  it('saves selected org to recent orgs in localStorage', () => {
    renderSelector();
    openDropdown();
    fireEvent.click(screen.getByTestId('org-option-stellar-org'));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toContain('stellar-org');
  });

  it('shows Recent section after an org has been selected', () => {
    // Seed recent org in storage before render
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['stellar-org']));
    renderSelector();
    openDropdown();
    expect(screen.getByTestId('section-recent')).toBeTruthy();
  });

  it('shows up to 5 recent orgs', () => {
    // Seed 5 recent orgs
    const recentIds = ORGS.slice(0, 5).map((o) => o.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentIds));
    renderSelector();
    openDropdown();
    // Recent section header should appear
    expect(screen.getByTestId('section-recent')).toBeTruthy();
    // All 5 options visible (at least)
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(5);
  });

  it('does not exceed maxRecent orgs in storage', () => {
    const { onChange, rerender } = renderSelector({ maxRecent: 3 });

    // Select 4 different orgs sequentially
    for (const org of ORGS.slice(0, 4)) {
      openDropdown();
      fireEvent.click(screen.getByTestId(`org-option-${org.id}`));
      rerender(
        <OrgSelector
          orgs={ORGS}
          value={org.id}
          onChange={onChange}
          storageKey={STORAGE_KEY}
          maxRecent={3}
        />
      );
    }

    const stored: string[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '[]'
    );
    expect(stored.length).toBeLessThanOrEqual(3);
  });

  it('hides Recent section when search query is active', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['stellar-org']));
    renderSelector();
    openDropdown();
    fireEvent.change(screen.getByTestId('org-selector-input'), {
      target: { value: 'sol' },
    });
    expect(screen.queryByTestId('section-recent')).toBeNull();
  });

  // ── Keyboard navigation ───────────────────────────────────────────────────

  it('ArrowDown moves active index down', () => {
    renderSelector();
    openDropdown();
    const input = screen.getByTestId('org-selector-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // First option should now be active
    const firstOption = screen.getAllByRole('option')[0];
    expect(firstOption.className).toMatch(/org-selector__option--active/);
  });

  it('ArrowUp from top wraps to last item', () => {
    renderSelector();
    openDropdown();
    const input = screen.getByTestId('org-selector-input');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const allOptions = screen.getAllByRole('option');
    const last = allOptions[allOptions.length - 1];
    expect(last.className).toMatch(/org-selector__option--active/);
  });

  it('Enter key selects the active item', () => {
    const { onChange } = renderSelector();
    openDropdown();
    const input = screen.getByTestId('org-selector-input');
    // Move down once to activate first option
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalled();
  });

  it('Escape key closes the dropdown', () => {
    renderSelector();
    openDropdown();
    fireEvent.keyDown(screen.getByTestId('org-selector-input'), {
      key: 'Escape',
    });
    expect(screen.queryByTestId('org-selector-dropdown')).toBeNull();
  });

  // ── ARIA ──────────────────────────────────────────────────────────────────

  it('search input has role="combobox"', () => {
    renderSelector();
    openDropdown();
    expect(
      screen.getByTestId('org-selector-input').getAttribute('role')
    ).toBe('combobox');
  });

  it('listbox has role="listbox"', () => {
    renderSelector();
    openDropdown();
    expect(screen.getByTestId('org-selector-list').getAttribute('role')).toBe(
      'listbox'
    );
  });

  it('options have role="option"', () => {
    renderSelector();
    openDropdown();
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
  });

  it('selected option has aria-selected=true', () => {
    renderSelector({ value: 'soroban-labs' });
    openDropdown();
    const option = screen.getByTestId('org-option-soroban-labs');
    expect(option.getAttribute('aria-selected')).toBe('true');
  });

  it('aria-activedescendant points to active option', () => {
    renderSelector();
    openDropdown();
    const input = screen.getByTestId('org-selector-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const activeId = input.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    expect(document.getElementById(activeId!)).toBeTruthy();
  });

  // ── Outside click ─────────────────────────────────────────────────────────

  it('closes on outside click', () => {
    renderSelector();
    openDropdown();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('org-selector-dropdown')).toBeNull();
  });
});
