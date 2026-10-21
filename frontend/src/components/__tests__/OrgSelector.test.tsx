/**
 * Tests for OrgSelector — issue #803
 *
 * Covers:
 *  1. Renders skeleton (aria-busy) while org list is loading
 *  2. Renders dropdown input when orgs data is available via prop injection
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrgSelector } from '../OrgSelector';
import type { Org } from '../OrgSelector';

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_ORGS: Org[] = [
  { id: 'stellar-org',  name: 'stellar-org',  activeIssueCount: 12 },
  { id: 'meridian-dao', name: 'meridian-dao', activeIssueCount: 4  },
];

describe('OrgSelector', () => {
  // ── 1. Loading skeleton ────────────────────────────────────────────────────
  it('unit_renders_skeleton_while_loading — shows aria-busy skeleton when no orgs prop and fetch is pending', () => {
    // Mock fetch to never resolve so loading state persists
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));

    const { container } = render(
      <MemoryRouter>
        <OrgSelector />
      </MemoryRouter>
    );

    // The skeleton wrapper has aria-busy="true"
    const busyEl = container.querySelector('[aria-busy="true"]');
    expect(busyEl).not.toBeNull();

    // The status role element is present for screen readers
    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute('aria-label')).toBe('Loading organisations');

    // The combobox input should NOT be rendered yet
    expect(container.querySelector('input')).toBeNull();
  });

  // ── 2. Dropdown when data is present ──────────────────────────────────────
  it('unit_renders_dropdown_when_orgs_provided — shows combobox input when orgs prop is injected', () => {
    const { container } = render(
      <MemoryRouter>
        <OrgSelector orgs={SAMPLE_ORGS} />
      </MemoryRouter>
    );

    // The combobox input should be present
    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    // No loading skeleton should be shown
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();

    // The label should be present
    expect(screen.getByText('Organisation')).toBeInTheDocument();
  });
});
