import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WalletAddress, truncateAddress } from '../components/WalletAddress'

const FULL_ADDRESS = 'GBXXX1ABCDEFGHIJKLMNO12345STELLARADDRESS'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  })
}

function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: undefined,
  })
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('truncateAddress', () => {
  it('truncates long addresses to first 4 + last 4 chars', () => {
    expect(truncateAddress(FULL_ADDRESS)).toBe('GBXX...RESS')
  })

  it('returns the address unchanged when it is 8 chars or shorter', () => {
    expect(truncateAddress('GABC1234')).toBe('GABC1234')
  })

  it('returns empty string for an empty address', () => {
    expect(truncateAddress('')).toBe('')
  })
})

describe('WalletAddress component', () => {
  const writeText = vi.fn()

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    setupClipboard(writeText)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders the truncated address', () => {
    render(<WalletAddress address={FULL_ADDRESS} />)
    expect(screen.getByText('GBXX...RESS')).toBeInTheDocument()
  })

  it('renders a copy button with an accessible aria-label', () => {
    render(<WalletAddress address={FULL_ADDRESS} />)
    expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument()
  })

  it('copies the FULL address (not the truncated one) on click', async () => {
    render(<WalletAddress address={FULL_ADDRESS} />)
    await userEvent.click(screen.getByRole('button', { name: /copy address/i }))
    expect(writeText).toHaveBeenCalledWith(FULL_ADDRESS)
  })

  it('shows a checkmark (copied state) after a successful copy', async () => {
    render(<WalletAddress address={FULL_ADDRESS} />)
    await userEvent.click(screen.getByRole('button', { name: /copy address/i }))
    expect(screen.getByRole('button', { name: /address copied/i })).toBeInTheDocument()
  })

  it('reverts back to copy icon after 2 seconds', async () => {
    vi.useFakeTimers()

    render(<WalletAddress address={FULL_ADDRESS} />)

    // Trigger click with act so React processes the async setState
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
      // flush the resolved writeText promise
      await Promise.resolve()
    })

    // Immediately: "copied" state
    expect(screen.getByRole('button', { name: /address copied/i })).toBeInTheDocument()

    // After 2001ms the timeout fires
    await act(async () => { vi.advanceTimersByTime(2001) })

    expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument()
  })

  it('falls back to window.prompt when clipboard API is unavailable', async () => {
    removeClipboard()
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)

    render(<WalletAddress address={FULL_ADDRESS} />)
    // Use fireEvent to avoid userEvent waiting for async state updates that won't come
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
    })

    expect(promptSpy).toHaveBeenCalledWith('Copy this address:', FULL_ADDRESS)
  })

  it('falls back to window.prompt when clipboard.writeText rejects', async () => {
    writeText.mockRejectedValue(new Error('Permission denied'))
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)

    render(<WalletAddress address={FULL_ADDRESS} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy address/i }))
    })

    expect(promptSpy).toHaveBeenCalledWith('Copy this address:', FULL_ADDRESS)
  })

  it('displays the full address in a tooltip on the address span', () => {
    render(<WalletAddress address={FULL_ADDRESS} />)
    expect(screen.getByText('GBXX...RESS')).toHaveAttribute('title', FULL_ADDRESS)
  })
})
