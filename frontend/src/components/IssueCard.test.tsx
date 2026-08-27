import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IssueCard } from './IssueCard'

const baseProps = {
  id:     '1',
  org:    'stellar-org',
  title:  'Fix TTL extension bug',
  status: 'open' as const,
}

const details = {
  applicantCount:       5,
  globalSlotsRemaining: 10,
  orgSlotsRemaining:    3,
  ttlExpiresAt:         null,
}

describe('IssueCard', () => {
  it('renders title, org, and status chip', () => {
    render(<IssueCard {...baseProps} />)
    expect(screen.getByText('Fix TTL extension bug')).toBeInTheDocument()
    expect(screen.getByText('stellar-org')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('does not render the toggle button when details prop is absent', () => {
    render(<IssueCard {...baseProps} />)
    expect(screen.queryByRole('button', { name: /details/i })).toBeNull()
  })

  it('renders the toggle button when details prop is present', () => {
    render(<IssueCard {...baseProps} details={details} />)
    expect(screen.getByRole('button', { name: /show application details/i })).toBeInTheDocument()
  })

  it('detail section is hidden (aria-hidden=true) initially', () => {
    render(<IssueCard {...baseProps} details={details} />)
    const region = screen.getByRole('region', { hidden: true })
    expect(region).toHaveAttribute('aria-hidden', 'true')
  })

  it('expands the detail section on toggle click', () => {
    render(<IssueCard {...baseProps} details={details} />)
    const toggle = screen.getByRole('button', { name: /show application details/i })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const region = screen.getByRole('region', { name: /application details/i })
    expect(region).toHaveAttribute('aria-hidden', 'false')
  })

  it('collapses on second toggle click', () => {
    render(<IssueCard {...baseProps} details={details} />)
    const toggle = screen.getByRole('button', { name: /show application details/i })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows applicant count in expanded state', () => {
    render(<IssueCard {...baseProps} details={details} />)
    fireEvent.click(screen.getByRole('button', { name: /show application details/i }))
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Applicants')).toBeInTheDocument()
  })

  it('shows global and org slots remaining', () => {
    render(<IssueCard {...baseProps} details={details} />)
    fireEvent.click(screen.getByRole('button', { name: /show application details/i }))
    expect(screen.getByText('10')).toBeInTheDocument() // global slots
    expect(screen.getByText('3')).toBeInTheDocument()  // org slots
  })

  it('shows cap warning when global slots are 0', () => {
    const capDetails = { ...details, globalSlotsRemaining: 0 }
    render(<IssueCard {...baseProps} details={capDetails} />)
    fireEvent.click(screen.getByRole('button', { name: /show application details/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/global application limit/i)
  })

  it('shows org cap warning when org slots are 0', () => {
    const capDetails = { ...details, orgSlotsRemaining: 0 }
    render(<IssueCard {...baseProps} details={capDetails} />)
    fireEvent.click(screen.getByRole('button', { name: /show application details/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/org assignment limit/i)
  })

  it('disables Apply button when at global cap', () => {
    const capDetails = { ...details, globalSlotsRemaining: 0 }
    render(<IssueCard {...baseProps} details={capDetails} />)
    expect(screen.getByRole('button', { name: /apply for issue/i })).toBeDisabled()
  })

  it('shows TTL countdown for applied status', () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const appliedDetails = { ...details, ttlExpiresAt: future }
    render(
      <IssueCard {...baseProps} status="applied" details={appliedDetails} />
    )
    fireEvent.click(screen.getByRole('button', { name: /show application details/i }))
    expect(screen.getByText('Application TTL')).toBeInTheDocument()
  })

  it('calls onApply when Apply is clicked', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    render(<IssueCard {...baseProps} onApply={onApply} />)
    fireEvent.click(screen.getByRole('button', { name: /apply for issue/i }))
    expect(onApply).toHaveBeenCalledWith('1')
  })

  it('calls onWithdraw when Withdraw is clicked', async () => {
    const onWithdraw = vi.fn().mockResolvedValue(undefined)
    render(
      <IssueCard {...baseProps} status="applied" onWithdraw={onWithdraw} />
    )
    fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }))
    expect(onWithdraw).toHaveBeenCalledWith('1')
  })

  it('collapses on Escape keydown', () => {
    render(<IssueCard {...baseProps} details={details} />)
    const toggle = screen.getByRole('button', { name: /show application details/i })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
