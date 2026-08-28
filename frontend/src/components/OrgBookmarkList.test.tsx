import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OrgBookmarkList } from './OrgBookmarkList'

const ORGS = [
  { id: 'stellar-org',   label: 'stellar-org' },
  { id: 'meridian-dao',  label: 'meridian-dao' },
  { id: 'soroban-tools', label: 'soroban-tools' },
  { id: 'horizon-api',   label: 'horizon-api' },
  { id: 'albedo-wallet', label: 'albedo-wallet' },
]

beforeEach(() => {
  localStorage.clear()
})

describe('OrgBookmarkList — rendering', () => {
  it('renders all org labels', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    ORGS.forEach(o => {
      expect(screen.getByRole('button', { name: `Open ${o.label}` })).toBeInTheDocument()
    })
  })

  it('renders a drag handle for each org', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    const handles = screen.getAllByRole('button', { name: /drag to reorder/i })
    expect(handles).toHaveLength(ORGS.length)
  })

  it('renders a pin button for each org', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    const pins = screen.getAllByRole('button', { name: /^Pin /i })
    expect(pins).toHaveLength(ORGS.length)
  })

  it('renders Reset order button', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    expect(screen.getByRole('button', { name: /reset organisation order/i })).toBeInTheDocument()
  })
})

describe('OrgBookmarkList — pinning', () => {
  it('pins an org and floats it to top', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    const pinBtn = screen.getByRole('button', { name: /^Pin meridian-dao$/i })
    fireEvent.click(pinBtn)

    // After pinning, the button label changes to "Unpin"
    expect(screen.getByRole('button', { name: /^Unpin meridian-dao$/i })).toBeInTheDocument()

    // meridian-dao should now be first in the list
    const items = screen.getAllByRole('option')
    expect(items[0]).toHaveTextContent('meridian-dao')
  })

  it('unpins an org', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    const pinBtn = screen.getByRole('button', { name: /^Pin stellar-org$/i })
    fireEvent.click(pinBtn) // pin
    fireEvent.click(screen.getByRole('button', { name: /^Unpin stellar-org$/i })) // unpin
    expect(screen.getByRole('button', { name: /^Pin stellar-org$/i })).toBeInTheDocument()
  })

  it('limits pinning to 3 orgs', () => {
    render(<OrgBookmarkList orgs={ORGS} />)

    // Pin 3 orgs
    fireEvent.click(screen.getByRole('button', { name: /^Pin stellar-org$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Pin meridian-dao$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Pin soroban-tools$/i }))

    // 4th pin button should be disabled
    const fourthPin = screen.getByRole('button', { name: /Cannot pin horizon-api/i })
    expect(fourthPin).toBeDisabled()
  })
})

describe('OrgBookmarkList — reset', () => {
  it('reset clears pins', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    fireEvent.click(screen.getByRole('button', { name: /^Pin stellar-org$/i }))
    fireEvent.click(screen.getByRole('button', { name: /reset organisation order/i }))
    // After reset, all items should show "Pin" not "Unpin"
    expect(screen.queryByRole('button', { name: /^Unpin/i })).toBeNull()
  })
})

describe('OrgBookmarkList — keyboard reorder', () => {
  it('moves an item down on ArrowDown', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    const firstHandle = screen.getAllByRole('button', { name: /drag to reorder stellar-org/i })[0]
    fireEvent.keyDown(firstHandle, { key: 'ArrowDown' })

    // stellar-org should now be at index 1 (second item)
    const items = screen.getAllByRole('option')
    expect(items[1]).toHaveTextContent('stellar-org')
  })

  it('moves an item up on ArrowUp', () => {
    render(<OrgBookmarkList orgs={ORGS} />)
    const secondHandle = screen.getAllByRole('button', { name: /drag to reorder meridian-dao/i })[0]
    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' })

    // meridian-dao should now be first
    const items = screen.getAllByRole('option')
    expect(items[0]).toHaveTextContent('meridian-dao')
  })
})

describe('OrgBookmarkList — onSelect', () => {
  it('calls onSelect when org label is clicked', () => {
    const onSelect = vi.fn()
    render(<OrgBookmarkList orgs={ORGS} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Open stellar-org/i }))
    expect(onSelect).toHaveBeenCalledWith(ORGS[0])
  })
})

describe('OrgBookmarkList — localStorage persistence', () => {
  it('persists pin state to localStorage', () => {
    render(<OrgBookmarkList orgs={ORGS} walletAddress="GTEST123" />)
    fireEvent.click(screen.getByRole('button', { name: /^Pin stellar-org$/i }))

    const stored = JSON.parse(localStorage.getItem('wg:pinned:GTEST123') ?? '[]') as string[]
    expect(stored).toContain('stellar-org')
  })
})
