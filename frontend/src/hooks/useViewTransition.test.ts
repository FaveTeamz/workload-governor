import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useViewTransition } from '../hooks/useViewTransition'

// jsdom doesn't implement window.matchMedia — provide a default stub
function mockMatchMedia(reducedMotion = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      reducedMotion && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('useViewTransition', () => {
  beforeEach(() => {
    // Default: motion is allowed, no startViewTransition
    mockMatchMedia(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).startViewTransition
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the callback immediately when View Transitions API is not supported', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useViewTransition())
    result.current(cb)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('wraps the callback in startViewTransition when the API is supported', () => {
    const vt = vi.fn((cb: () => void) => cb())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).startViewTransition = vt

    const cb = vi.fn()
    const { result } = renderHook(() => useViewTransition())
    result.current(cb)

    expect(vt).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('skips startViewTransition when prefers-reduced-motion is set', () => {
    const vt = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).startViewTransition = vt

    // Simulate prefers-reduced-motion: reduce
    mockMatchMedia(true)

    const cb = vi.fn()
    const { result } = renderHook(() => useViewTransition())
    result.current(cb)

    // Should NOT have used the API — called cb directly
    expect(vt).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('calls the callback directly when matchMedia is not available', () => {
    // Simulate an environment where matchMedia is missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).matchMedia

    const cb = vi.fn()
    const { result } = renderHook(() => useViewTransition())
    result.current(cb)

    expect(cb).toHaveBeenCalledOnce()
  })
})
