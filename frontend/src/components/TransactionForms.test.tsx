import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApplyForm, AssignForm, CompleteForm, RevokeForm } from './TransactionForms'

const VALID_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW'
const REGISTERED_ORGS = ['stellar-org', 'meridian-dao']

// ─── ApplyForm ────────────────────────────────────────────────────────────────

describe('ApplyForm', () => {
  it('renders org and issue fields', () => {
    render(<ApplyForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/organisation id/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/issue id/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument()
  })

  it('shows no errors before user interaction', () => {
    render(<ApplyForm onSubmit={vi.fn()} registeredOrgs={REGISTERED_ORGS} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows org error on blur when empty', async () => {
    render(<ApplyForm onSubmit={vi.fn()} registeredOrgs={REGISTERED_ORGS} />)
    const orgInput = screen.getByLabelText(/organisation id/i)
    fireEvent.blur(orgInput)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/required/i)
    )
  })

  it('shows issue error on blur when empty', async () => {
    render(<ApplyForm onSubmit={vi.fn()} registeredOrgs={REGISTERED_ORGS} />)
    const issueInput = screen.getByLabelText(/issue id/i)
    fireEvent.blur(issueInput)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/required/i)
    )
  })

  it('shows error for invalid issue ID (float)', async () => {
    render(<ApplyForm onSubmit={vi.fn()} />)
    const issueInput = screen.getByLabelText(/issue id/i)
    await userEvent.type(issueInput, '3.14')
    fireEvent.blur(issueInput)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/positive integer/i)
    )
  })

  it('shows already-applied error for known issue ID', async () => {
    render(<ApplyForm onSubmit={vi.fn()} appliedIssueIds={['42']} />)
    const issueInput = screen.getByLabelText(/issue id/i)
    await userEvent.type(issueInput, '42')
    fireEvent.blur(issueInput)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/already applied/i)
    )
  })

  it('shows unregistered org error', async () => {
    render(<ApplyForm onSubmit={vi.fn()} registeredOrgs={REGISTERED_ORGS} />)
    const orgInput = screen.getByLabelText(/organisation id/i)
    await userEvent.type(orgInput, 'unknown-org')
    fireEvent.blur(orgInput)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/not registered/i)
    )
  })

  it('shows cap warning when global slots are 0', () => {
    render(
      <ApplyForm
        onSubmit={vi.fn()}
        capStatus={{ globalSlotsRemaining: 0, orgSlotsRemaining: 3 }}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/global application limit/i)
  })

  it('disables submit when at global cap', () => {
    render(
      <ApplyForm
        onSubmit={vi.fn()}
        capStatus={{ globalSlotsRemaining: 0, orgSlotsRemaining: 3 }}
      />
    )
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()
  })

  it('calls onSubmit with valid data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ApplyForm
        onSubmit={onSubmit}
        registeredOrgs={REGISTERED_ORGS}
        capStatus={{ globalSlotsRemaining: 5, orgSlotsRemaining: 3 }}
      />
    )
    await userEvent.type(screen.getByLabelText(/organisation id/i), 'stellar-org')
    await userEvent.type(screen.getByLabelText(/issue id/i), '42')
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ orgId: 'stellar-org', issueId: '42' })
    )
  })

  it('does not call onSubmit when form has errors', async () => {
    const onSubmit = vi.fn()
    render(<ApplyForm onSubmit={onSubmit} registeredOrgs={REGISTERED_ORGS} />)
    // Submit without filling fields
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await waitFor(() =>
      expect(onSubmit).not.toHaveBeenCalled()
    )
  })

  it('error messages are associated via aria-describedby', async () => {
    render(<ApplyForm onSubmit={vi.fn()} />)
    const issueInput = screen.getByLabelText(/issue id/i)
    fireEvent.blur(issueInput)
    await waitFor(() => {
      const error = screen.getByRole('alert')
      const describedBy = issueInput.getAttribute('aria-describedby') ?? ''
      expect(describedBy).toContain(error.id)
    })
  })

  it('sets aria-invalid on input with error', async () => {
    render(<ApplyForm onSubmit={vi.fn()} />)
    const issueInput = screen.getByLabelText(/issue id/i)
    fireEvent.blur(issueInput)
    await waitFor(() =>
      expect(issueInput).toHaveAttribute('aria-invalid', 'true')
    )
  })
})

// ─── AssignForm ────────────────────────────────────────────────────────────────

describe('AssignForm', () => {
  it('renders contributor, org, and issue fields', () => {
    render(<AssignForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/contributor address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/organisation id/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/issue id/i)).toBeInTheDocument()
  })

  it('validates contributor address on blur', async () => {
    render(<AssignForm onSubmit={vi.fn()} />)
    const input = screen.getByLabelText(/contributor address/i)
    fireEvent.change(input, { target: { value: 'not-a-key' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/stellar public key/i)
    )
  })

  it('calls onSubmit with valid data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AssignForm onSubmit={onSubmit} registeredOrgs={REGISTERED_ORGS} />)
    // Use fireEvent.change to set values atomically (avoids per-keystroke validation issues)
    fireEvent.change(screen.getByLabelText(/contributor address/i), { target: { value: VALID_KEY } })
    fireEvent.change(screen.getByLabelText(/organisation id/i),     { target: { value: 'stellar-org' } })
    fireEvent.change(screen.getByLabelText(/issue id/i),            { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: /^assign$/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        contributor: VALID_KEY,
        orgId: 'stellar-org',
        issueId: '7',
      })
    )
  })
})

// ─── CompleteForm ─────────────────────────────────────────────────────────────

describe('CompleteForm', () => {
  it('renders complete form fields', () => {
    render(<CompleteForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/contributor address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument()
  })

  it('shows validation errors on submit attempt', async () => {
    render(<CompleteForm onSubmit={vi.fn()} registeredOrgs={REGISTERED_ORGS} />)
    fireEvent.click(screen.getByRole('button', { name: /^complete$/i }))
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })
})

// ─── RevokeForm ───────────────────────────────────────────────────────────────

describe('RevokeForm', () => {
  it('renders revoke form fields', () => {
    render(<RevokeForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/contributor address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument()
  })

  it('shows validation errors on submit attempt', async () => {
    render(<RevokeForm onSubmit={vi.fn()} registeredOrgs={REGISTERED_ORGS} />)
    fireEvent.click(screen.getByRole('button', { name: /^revoke$/i }))
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeGreaterThan(0)
    })
  })
})
