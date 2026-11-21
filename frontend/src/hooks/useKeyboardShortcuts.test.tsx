import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useKeyboardShortcuts, type ShortcutHandler } from '../hooks/useKeyboardShortcuts'

// ---------------------------------------------------------------------------
// Helper: minimal component that wires the hook
// ---------------------------------------------------------------------------

interface TestProps {
  shortcuts: ShortcutHandler[]
  enabled?: boolean
}

function TestComponent({ shortcuts, enabled }: TestProps) {
  useKeyboardShortcuts(shortcuts, enabled)
  return <div data-testid="root" tabIndex={0} />
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the handler when the matching key is pressed', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: '?', description: 'Help', handler },
    ]

    render(<TestComponent shortcuts={shortcuts} />)
    fireEvent.keyDown(document, { key: '?' })

    expect(handler).toHaveBeenCalledOnce()
  })

  it('does NOT call the handler when a different key is pressed', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: '?', description: 'Help', handler },
    ]

    render(<TestComponent shortcuts={shortcuts} />)
    fireEvent.keyDown(document, { key: 'a' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire when a modifier key is held', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: '/', description: 'Search', handler },
    ]

    render(<TestComponent shortcuts={shortcuts} />)
    // Ctrl+/ — should NOT trigger
    fireEvent.keyDown(document, { key: '/', ctrlKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire when focus is inside an <input>', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: '?', description: 'Help', handler },
    ]

    render(
      <>
        <TestComponent shortcuts={shortcuts} />
        <input data-testid="search" type="text" />
      </>
    )

    const input = screen.getByTestId('search')
    // Fire keydown with the input as the target
    fireEvent.keyDown(input, { key: '?' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire when focus is inside a <textarea>', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: '?', description: 'Help', handler },
    ]

    render(
      <>
        <TestComponent shortcuts={shortcuts} />
        <textarea data-testid="area" />
      </>
    )

    fireEvent.keyDown(screen.getByTestId('area'), { key: '?' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire when enabled=false', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: '?', description: 'Help', handler },
    ]

    render(<TestComponent shortcuts={shortcuts} enabled={false} />)
    fireEvent.keyDown(document, { key: '?' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('fires when enabled=true (default)', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: 'Escape', description: 'Close modal', handler },
    ]

    render(<TestComponent shortcuts={shortcuts} enabled={true} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(handler).toHaveBeenCalledOnce()
  })

  it('only calls the first matching handler when multiple shortcuts have the same key', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    const shortcuts: ShortcutHandler[] = [
      { key: 'n', description: 'First', handler: h1 },
      { key: 'n', description: 'Second', handler: h2 },
    ]

    render(<TestComponent shortcuts={shortcuts} />)
    fireEvent.keyDown(document, { key: 'n' })

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).not.toHaveBeenCalled()
  })
})
