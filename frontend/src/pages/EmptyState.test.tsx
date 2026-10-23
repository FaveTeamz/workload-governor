import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MaintainerPage } from '../pages/MaintainerPage'
import { ForbiddenPage } from '../pages/ForbiddenPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAINTAINER = 'GMAINTAINERADDRESS12345678'
const ORG = 'stellar-org'

function buildClient(opts: {
  isMaintainer?: boolean
  apps?: { contributor: string; issue_id: string; date: string }[]
  asgns?: { contributor: string; issue_id: string; date: string }[]
}) {
  return {
    is_maintainer: vi.fn().mockResolvedValue(opts.isMaintainer ?? true),
    list_applications: vi.fn().mockResolvedValue(opts.apps ?? []),
    list_assignments: vi.fn().mockResolvedValue(opts.asgns ?? []),
    assign_issue: vi.fn().mockResolvedValue(undefined),
    complete_assignment: vi.fn().mockResolvedValue(undefined),
    revoke_assignment: vi.fn().mockResolvedValue(undefined),
  }
}

function setWallet(publicKey: string | null) {
  if (publicKey) {
    localStorage.setItem('wg_wallet_pubkey', publicKey)
  } else {
    localStorage.removeItem('wg_wallet_pubkey')
  }
}

function renderPage(orgId = ORG) {
  return render(
    <MemoryRouter initialEntries={[`/maintainer/${orgId}`]}>
      <Routes>
        <Route path="/maintainer/:org_id" element={<MaintainerPage />} />
        <Route path="/403" element={<ForbiddenPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Empty-state tests
// ---------------------------------------------------------------------------

describe('MaintainerPage — empty state', () => {
  beforeEach(() => {
    setWallet(MAINTAINER)
  })

  afterEach(() => {
    localStorage.clear()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__contract_client__
  })

  it('renders EmptyState with illustration when there are no applications', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ apps: [] })
    const { container } = renderPage()

    await waitFor(() => {
      // The EmptyState "no-issues" variant title (h3 heading)
      expect(screen.getByRole('heading', { name: /No open issues/i })).toBeInTheDocument()
    })

    // Illustration is aria-hidden so query the DOM directly
    const img = container.querySelector('.empty-state__illustration')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toContain('empty-issues.svg')
  })

  it('renders a Refresh button when no applications exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ apps: [] })
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
    })
  })

  it('clicking Refresh re-fetches the data', async () => {
    const client = buildClient({ apps: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = client

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }))

    // list_applications is called once on mount + once after Refresh
    await waitFor(() => {
      expect(client.list_applications).toHaveBeenCalledTimes(2)
    })
  })

  it('renders EmptyState for active assignments when there are none', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ asgns: [] })
    renderPage()

    // Switch to assignments tab
    await waitFor(() => screen.getByRole('tab', { name: /Active Assignments/i }))
    await userEvent.click(screen.getByRole('tab', { name: /Active Assignments/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /No active assignments/i })).toBeInTheDocument()
    })
  })
})
