import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumb } from '../components/Breadcrumb'
import type { BreadcrumbItem } from '../components/Breadcrumb'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBreadcrumb(items: BreadcrumbItem[]) {
  return render(
    <MemoryRouter>
      <Breadcrumb items={items} />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const HOME_ITEM: BreadcrumbItem = { label: 'Home', path: '/' }
const ORG_ITEM:  BreadcrumbItem = { label: 'stellar-org', path: '/orgs/stellar-org' }
const ISSUE_ITEM: BreadcrumbItem = { label: 'Fix TTL extension bug' }
const LONG_LABEL = 'This is a very long issue title that exceeds forty characters and should be truncated'
const TRUNCATED   = 'This is a very long issue title that exc…'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Breadcrumb', () => {
  // ── Basic rendering ────────────────────────────────────────────────────

  it('renders nothing when items is empty', () => {
    const { container } = renderBreadcrumb([])
    expect(container.firstChild).toBeNull()
  })

  it('renders a nav element with accessible label', () => {
    renderBreadcrumb([HOME_ITEM])
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()
  })

  it('renders an ordered list of items', () => {
    renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
  })

  it('renders each item label', () => {
    renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('stellar-org')).toBeInTheDocument()
    expect(screen.getByText('Fix TTL extension bug')).toBeInTheDocument()
  })

  // ── Links and current page ─────────────────────────────────────────────

  it('renders intermediate items as links', () => {
    renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const homeLink = screen.getByRole('link', { name: 'Home' })
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute('href', '/')

    const orgLink = screen.getByRole('link', { name: 'stellar-org' })
    expect(orgLink).toBeInTheDocument()
    expect(orgLink).toHaveAttribute('href', '/orgs/stellar-org')
  })

  it('renders the last item without a link (current page)', () => {
    renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    // The issue title should not be an anchor
    const issueEl = screen.getByText('Fix TTL extension bug')
    expect(issueEl.tagName).not.toBe('A')
  })

  it('marks the last item with aria-current="page"', () => {
    renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const currentEl = screen.getByText('Fix TTL extension bug')
    expect(currentEl).toHaveAttribute('aria-current', 'page')
  })

  it('does not apply aria-current to intermediate items', () => {
    renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const homeLink = screen.getByRole('link', { name: 'Home' })
    expect(homeLink).not.toHaveAttribute('aria-current')
  })

  // ── Single-item edge case ──────────────────────────────────────────────

  it('renders a single item as current page (no link)', () => {
    renderBreadcrumb([{ label: 'Home' }])
    expect(screen.getByText('Home')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link')).toBeNull()
  })

  // ── Truncation ─────────────────────────────────────────────────────────

  it('truncates labels longer than 40 characters', () => {
    renderBreadcrumb([HOME_ITEM, { label: LONG_LABEL }])
    const truncatedEl = screen.getByText(TRUNCATED)
    expect(truncatedEl).toBeInTheDocument()
  })

  it('adds a title attribute with the full text when truncated', () => {
    renderBreadcrumb([HOME_ITEM, { label: LONG_LABEL }])
    const el = screen.getByText(TRUNCATED)
    expect(el).toHaveAttribute('title', LONG_LABEL)
  })

  it('does not add a title attribute when label is exactly 40 chars', () => {
    const exactly40 = 'A'.repeat(40)
    renderBreadcrumb([HOME_ITEM, { label: exactly40 }])
    const el = screen.getByText(exactly40)
    expect(el).not.toHaveAttribute('title')
  })

  it('does not truncate labels of 40 characters or fewer', () => {
    const short = 'Short label'
    renderBreadcrumb([HOME_ITEM, { label: short }])
    expect(screen.getByText(short)).toBeInTheDocument()
  })

  it('truncates and adds title on a link item (not just last item)', () => {
    renderBreadcrumb([
      { label: LONG_LABEL, path: '/some/path' },
      ISSUE_ITEM,
    ])
    const link = screen.getByRole('link', { name: TRUNCATED })
    expect(link).toHaveAttribute('title', LONG_LABEL)
  })

  // ── schema.org structured data ─────────────────────────────────────────

  it('renders a JSON-LD script tag', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
  })

  it('JSON-LD contains BreadcrumbList type', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const script = container.querySelector('script[type="application/ld+json"]')!
    const data = JSON.parse(script.textContent ?? '{}')
    expect(data['@type']).toBe('BreadcrumbList')
  })

  it('JSON-LD contains correct number of list elements', () => {
    const items = [HOME_ITEM, ORG_ITEM, ISSUE_ITEM]
    const { container } = renderBreadcrumb(items)
    const script = container.querySelector('script[type="application/ld+json"]')!
    const data = JSON.parse(script.textContent ?? '{}')
    expect(data.itemListElement).toHaveLength(items.length)
  })

  it('JSON-LD positions are 1-indexed', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const script = container.querySelector('script[type="application/ld+json"]')!
    const data = JSON.parse(script.textContent ?? '{}')
    expect(data.itemListElement[0].position).toBe(1)
    expect(data.itemListElement[1].position).toBe(2)
    expect(data.itemListElement[2].position).toBe(3)
  })

  it('JSON-LD items have correct name property', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const script = container.querySelector('script[type="application/ld+json"]')!
    const data = JSON.parse(script.textContent ?? '{}')
    expect(data.itemListElement[0].name).toBe('Home')
    expect(data.itemListElement[1].name).toBe('stellar-org')
    expect(data.itemListElement[2].name).toBe('Fix TTL extension bug')
  })

  it('JSON-LD link items have an "item" (URL) property', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const script = container.querySelector('script[type="application/ld+json"]')!
    const data = JSON.parse(script.textContent ?? '{}')
    // HOME_ITEM has path '/'
    expect(data.itemListElement[0].item).toBeDefined()
    expect(data.itemListElement[0].item).toMatch(/\/$/)
    // ORG_ITEM has path
    expect(data.itemListElement[1].item).toBeDefined()
  })

  it('JSON-LD last item (current page) has no "item" property', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const script = container.querySelector('script[type="application/ld+json"]')!
    const data = JSON.parse(script.textContent ?? '{}')
    // ISSUE_ITEM has no path
    expect(data.itemListElement[2].item).toBeUndefined()
  })

  // ── Mobile CSS classes ─────────────────────────────────────────────────

  it('marks the item before the last as breadcrumb__item--parent', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const items = container.querySelectorAll('.breadcrumb__item')
    // items[0] = Home, items[1] = stellar-org (parent), items[2] = Issue (current)
    expect(items[1]).toHaveClass('breadcrumb__item--parent')
  })

  it('marks the last item as breadcrumb__item--current', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const items = container.querySelectorAll('.breadcrumb__item')
    expect(items[2]).toHaveClass('breadcrumb__item--current')
  })

  it('does not add parent/current classes to non-adjacent items', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM, ISSUE_ITEM])
    const items = container.querySelectorAll('.breadcrumb__item')
    // Home (index 0) should have neither class
    expect(items[0]).not.toHaveClass('breadcrumb__item--parent')
    expect(items[0]).not.toHaveClass('breadcrumb__item--current')
  })

  // ── Two-item chain ─────────────────────────────────────────────────────

  it('with two items, first is both parent and a link, second is current', () => {
    const { container } = renderBreadcrumb([HOME_ITEM, ORG_ITEM])
    const items = container.querySelectorAll('.breadcrumb__item')
    expect(items[0]).toHaveClass('breadcrumb__item--parent')
    expect(items[1]).toHaveClass('breadcrumb__item--current')
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('stellar-org')).toHaveAttribute('aria-current', 'page')
  })
})
