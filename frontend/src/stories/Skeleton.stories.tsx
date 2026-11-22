import type { Meta, StoryObj } from '@storybook/react'
import {
  Skeleton,
  IssueCardSkeleton,
  AssignmentRowSkeleton,
  EventHistoryRowSkeleton,
  WorkloadGaugeSkeleton,
  OrgSelectorSkeleton,
} from '../components/Skeleton'

const meta: Meta = {
  title:  'Design System/Skeleton',
  tags:   ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta

// ── Base Skeleton ──────────────────────────────────────────────────────────

export const BaseBlock: StoryObj<typeof Skeleton> = {
  name:    'Base — block',
  render:  () => <Skeleton width="100%" height={20} />,
}

export const BaseInlinePill: StoryObj<typeof Skeleton> = {
  name:    'Base — inline pill',
  render:  () => <Skeleton width={80} height={20} radius={9999} />,
}

export const BaseMultiLine: StoryObj<typeof Skeleton> = {
  name:    'Base — multi-line text placeholder',
  render:  () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
      <Skeleton width="100%" height={16} />
      <Skeleton width="85%"  height={16} />
      <Skeleton width="60%"  height={16} />
    </div>
  ),
}

// ── Compound variants ──────────────────────────────────────────────────────

export const IssueCard: StoryObj = {
  name:   'Variant — IssueCard',
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <IssueCardSkeleton />
    </div>
  ),
}

export const IssueCardList: StoryObj = {
  name:   'Variant — IssueCard list (3 items)',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
      <IssueCardSkeleton />
      <IssueCardSkeleton />
      <IssueCardSkeleton />
    </div>
  ),
}

export const AssignmentRow: StoryObj = {
  name:   'Variant — AssignmentRow',
  render: () => (
    <ul style={{ listStyle: 'none', padding: 0, maxWidth: 700 }}>
      <AssignmentRowSkeleton />
      <AssignmentRowSkeleton />
      <AssignmentRowSkeleton />
    </ul>
  ),
}

export const EventHistoryRow: StoryObj = {
  name:   'Variant — EventHistoryTable row',
  render: () => (
    <ol style={{ listStyle: 'none', padding: 0, maxWidth: 700 }}>
      <EventHistoryRowSkeleton />
      <EventHistoryRowSkeleton />
      <EventHistoryRowSkeleton />
    </ol>
  ),
}

export const WorkloadGauge: StoryObj = {
  name:   'Variant — WorkloadGauge',
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      <WorkloadGaugeSkeleton size={120} />
      <WorkloadGaugeSkeleton size={80} />
    </div>
  ),
}

export const OrgSelector: StoryObj = {
  name:   'Variant — OrgSelector',
  render: () => (
    <div style={{ maxWidth: 220 }}>
      <OrgSelectorSkeleton count={5} />
    </div>
  ),
}

// ── All variants in one page ───────────────────────────────────────────────
export const AllVariants: StoryObj = {
  name:   'All variants',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 700 }}>
      <section>
        <h3 style={{ marginBottom: 8, fontSize: '0.875rem', color: '#94a3b8' }}>IssueCard</h3>
        <IssueCardSkeleton />
      </section>
      <section>
        <h3 style={{ marginBottom: 8, fontSize: '0.875rem', color: '#94a3b8' }}>AssignmentRow</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <AssignmentRowSkeleton />
        </ul>
      </section>
      <section>
        <h3 style={{ marginBottom: 8, fontSize: '0.875rem', color: '#94a3b8' }}>EventHistoryRow</h3>
        <ol style={{ listStyle: 'none', padding: 0 }}>
          <EventHistoryRowSkeleton />
        </ol>
      </section>
      <section>
        <h3 style={{ marginBottom: 8, fontSize: '0.875rem', color: '#94a3b8' }}>WorkloadGauge</h3>
        <WorkloadGaugeSkeleton size={120} />
      </section>
      <section>
        <h3 style={{ marginBottom: 8, fontSize: '0.875rem', color: '#94a3b8' }}>OrgSelector (5 items)</h3>
        <OrgSelectorSkeleton count={5} />
      </section>
    </div>
  ),
}
