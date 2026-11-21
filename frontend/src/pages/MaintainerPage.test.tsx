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

function makeRow(i: number) {
  return {
    contributor: `GCONTRIB${String(i).padStart(10, '0')}`,
    issue_id: `issue-${i}`,
    date: '2026-06-01',
  }
}

function buildClient(opts: {
  isMaintainer?: boolean
  apps?: ReturnType<typeof makeRow>[]
  asgns?: ReturnType<typeof makeRow>[]
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
// Tests
// ---------------------------------------------------------------------------

describe('MaintainerPage', () => {
  beforeEach(() => {
    setWallet(MAINTAINER)
  })

  afterEach(() => {
    localStorage.clear()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__contract_client__
  })

  // --- Role guard -----------------------------------------------------------

  it('redirects to /403 when wallet is not connected', async () => {
    setWallet(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ isMaintainer: false })
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveTextContent('403')
    })
  })

  it('redirects to /403 when is_maintainer returns false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ isMaintainer: false })
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveTextContent('403')
    })
  })

  it('renders the page when is_maintainer returns true', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ isMaintainer: true })
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Pending Applications/i })).toBeInTheDocument()
    })
  })

  // --- Table rendering & tabs ----------------------------------------------

  it('shows applications in the applications tab', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({
      apps: [makeRow(1)],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('issue-1')).toBeInTheDocument())
  })

  it('switches to assignments tab and shows assignments', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({
      asgns: [makeRow(2)],
    })
    renderPage()
    await waitFor(() => screen.getByRole('tab', { name: /Active Assignments/i }))
    await userEvent.click(screen.getByRole('tab', { name: /Active Assignments/i }))
    await waitFor(() => expect(screen.getByText('issue-2')).toBeInTheDocument())
  })

  // --- Pagination ----------------------------------------------------------

  it('paginates applications at 20 rows per page', async () => {
    const apps = Array.from({ length: 25 }, (_, i) => makeRow(i + 1))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ apps })
    renderPage()
    // Wait for data to load — first page has 20 rows
    await waitFor(() => expect(screen.getByText('issue-1')).toBeInTheDocument())
    expect(screen.queryByText('issue-21')).not.toBeInTheDocument()
  })

  it('navigates to page 2 and shows the remaining rows', async () => {
    const apps = Array.from({ length: 25 }, (_, i) => makeRow(i + 1))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ apps })
    renderPage()
    await waitFor(() => screen.getByText('issue-1'))
    await userEvent.click(screen.getByRole('button', { name: /next page/i }))
    await waitFor(() => expect(screen.getByText('issue-21')).toBeInTheDocument())
    expect(screen.queryByText('issue-1')).not.toBeInTheDocument()
  })

  // --- Actions -------------------------------------------------------------

  it('calls assign_issue when Assign is clicked', async () => {
    const client = buildClient({ apps: [makeRow(1)] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = client
    renderPage()
    await waitFor(() => screen.getByLabelText(/Assign issue issue-1/i))
    await userEvent.click(screen.getByLabelText(/Assign issue issue-1/i))
    await waitFor(() => expect(client.assign_issue).toHaveBeenCalledWith(
      MAINTAINER,
      makeRow(1).contributor,
      ORG,
      'issue-1'
    ))
  })

  it('calls complete_assignment when Complete is clicked', async () => {
    const client = buildClient({ asgns: [makeRow(3)] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = client
    renderPage()
    // Switch to assignments tab
    await waitFor(() => screen.getByRole('tab', { name: /Active Assignments/i }))
    await userEvent.click(screen.getByRole('tab', { name: /Active Assignments/i }))
    await waitFor(() => screen.getByLabelText(/Complete issue issue-3/i))
    await userEvent.click(screen.getByLabelText(/Complete issue issue-3/i))
    await waitFor(() => expect(client.complete_assignment).toHaveBeenCalledWith(
      MAINTAINER,
      makeRow(3).contributor,
      ORG,
      'issue-3'
    ))
  })

  // --- Revoke modal --------------------------------------------------------

  it('shows confirmation modal when Revoke is clicked', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = buildClient({ asgns: [makeRow(4)] })
    renderPage()
    await waitFor(() => screen.getByRole('tab', { name: /Active Assignments/i }))
    await userEvent.click(screen.getByRole('tab', { name: /Active Assignments/i }))
    await waitFor(() => screen.getByLabelText(/Revoke issue issue-4/i))
    await userEvent.click(screen.getByLabelText(/Revoke issue issue-4/i))
    expect(screen.getByText(/Confirm Revoke/i)).toBeInTheDocument()
    expect(screen.getAllByText(/issue-4/).length).toBeGreaterThan(0)
  })

  it('cancels revoke when Cancel is clicked in modal', async () => {
    const client = buildClient({ asgns: [makeRow(5)] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = client
    renderPage()
    await waitFor(() => screen.getByRole('tab', { name: /Active Assignments/i }))
    await userEvent.click(screen.getByRole('tab', { name: /Active Assignments/i }))
    await waitFor(() => screen.getByLabelText(/Revoke issue issue-5/i))
    await userEvent.click(screen.getByLabelText(/Revoke issue issue-5/i))
    // Click Cancel in modal footer
    const cancelBtns = screen.getAllByRole('button', { name: /Cancel/i })
    await userEvent.click(cancelBtns[0])
    expect(client.revoke_assignment).not.toHaveBeenCalled()
  })

  it('calls revoke_assignment when Revoke is confirmed in modal', async () => {
    const client = buildClient({ asgns: [makeRow(6)] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__contract_client__ = client
    renderPage()
    await waitFor(() => screen.getByRole('tab', { name: /Active Assignments/i }))
    await userEvent.click(screen.getByRole('tab', { name: /Active Assignments/i }))
    await waitFor(() => screen.getByLabelText(/Revoke issue issue-6/i))
    await userEvent.click(screen.getByLabelText(/Revoke issue issue-6/i))
    // Confirm inside modal — look for the btn-revoke button with text "Revoke"
    const revokeBtns = screen.getAllByRole('button', { name: /^Revoke$/i })
    // The one inside the modal footer
    await userEvent.click(revokeBtns[revokeBtns.length - 1])
    await waitFor(() => expect(client.revoke_assignment).toHaveBeenCalledWith(
      MAINTAINER,
      makeRow(6).contributor,
      ORG,
      'issue-6'
    ))
  })
})
