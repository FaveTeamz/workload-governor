import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  Skeleton,
  IssueCardSkeleton,
  AssignmentRowSkeleton,
  EventHistoryRowSkeleton,
  WorkloadGaugeSkeleton,
  OrgSelectorSkeleton,
} from './Skeleton'

describe('Skeleton snapshots', () => {
  it('Skeleton base renders correctly', () => {
    const { container } = render(<Skeleton width={200} height={20} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('IssueCardSkeleton renders correctly', () => {
    const { container } = render(<IssueCardSkeleton />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('AssignmentRowSkeleton renders correctly', () => {
    const { asFragment } = render(
      <ul>
        <AssignmentRowSkeleton />
      </ul>
    )
    expect(asFragment()).toMatchSnapshot()
  })

  it('EventHistoryRowSkeleton renders correctly', () => {
    const { asFragment } = render(
      <ol>
        <EventHistoryRowSkeleton />
      </ol>
    )
    expect(asFragment()).toMatchSnapshot()
  })

  it('WorkloadGaugeSkeleton renders correctly at default size', () => {
    const { container } = render(<WorkloadGaugeSkeleton />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('WorkloadGaugeSkeleton renders correctly at custom size', () => {
    const { container } = render(<WorkloadGaugeSkeleton size={80} />)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('OrgSelectorSkeleton renders 5 items', () => {
    const { container } = render(<OrgSelectorSkeleton count={5} />)
    expect(container.firstChild).toMatchSnapshot()
    // Verify item count
    const items = container.querySelectorAll('.org-list__item')
    expect(items).toHaveLength(5)
  })

  it('OrgSelectorSkeleton renders custom count', () => {
    const { container } = render(<OrgSelectorSkeleton count={3} />)
    const items = container.querySelectorAll('.org-list__item')
    expect(items).toHaveLength(3)
  })
})

describe('Skeleton accessibility', () => {
  it('Skeleton has aria-hidden and presentation role', () => {
    const { container } = render(<Skeleton width={100} height={16} />)
    const el = container.querySelector('[role="presentation"]')!
    expect(el).toHaveAttribute('aria-hidden', 'true')
  })

  it('IssueCardSkeleton has aria-busy and loading label', () => {
    const { getByRole } = render(<IssueCardSkeleton />)
    const article = getByRole('article')
    expect(article).toHaveAttribute('aria-busy', 'true')
    expect(article).toHaveAttribute('aria-label', 'Loading issue')
  })

  it('WorkloadGaugeSkeleton has aria-busy', () => {
    const { container } = render(<WorkloadGaugeSkeleton />)
    const figure = container.querySelector('figure')!
    expect(figure).toHaveAttribute('aria-busy', 'true')
  })
})
