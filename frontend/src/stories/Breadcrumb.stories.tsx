import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumb } from '../components/Breadcrumb'
import '../tokens.css'

const meta: Meta<typeof Breadcrumb> = {
  title:     'Design System/Breadcrumb',
  component: Breadcrumb,
  tags:      ['autodocs'],
  parameters: {
    layout: 'padded',
    backgrounds: { default: 'dark', values: [{ name: 'dark', value: '#0f1117' }] },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof Breadcrumb>

// --- Issue detail (Home > Org > Issue) ---
export const IssueDetail: Story = {
  name: 'Issue Detail — Home › Org › Issue',
  args: {
    items: [
      { label: 'Home',         path: '/' },
      { label: 'stellar-org',  path: '/orgs/stellar-org' },
      { label: 'Fix TTL extension bug in apply_for_issue contract method' },
    ],
  },
}

// --- Contributor profile ---
export const ContributorProfile: Story = {
  name: 'Contributor Profile — Home › Contributor',
  args: {
    items: [
      { label: 'Home',                      path: '/' },
      { label: 'GBXXX1ABCDEFGHIJKLMNO…45' },
    ],
  },
}

// --- Org detail ---
export const OrgDetail: Story = {
  name: 'Org Detail — Home › Org',
  args: {
    items: [
      { label: 'Home',        path: '/' },
      { label: 'meridian-dao' },
    ],
  },
}

// --- Maintainer dashboard ---
export const MaintainerDashboard: Story = {
  name: 'Maintainer Dashboard — Home › Org › Maintainer',
  args: {
    items: [
      { label: 'Home',         path: '/' },
      { label: 'stellar-org',  path: '/orgs/stellar-org' },
      { label: 'Maintainer Dashboard' },
    ],
  },
}

// --- Long title truncation ---
export const LongTitleTruncated: Story = {
  name: 'Long title — truncated at 40 characters',
  args: {
    items: [
      { label: 'Home',        path: '/' },
      { label: 'stellar-org', path: '/orgs/stellar-org' },
      { label: 'This is a very long issue title that exceeds forty characters and should be truncated with ellipsis' },
    ],
  },
}

// --- Single crumb (home only) ---
export const HomeOnly: Story = {
  name: 'Home only (root route)',
  args: {
    items: [
      { label: 'Home' },
    ],
  },
}

// --- Empty (renders nothing) ---
export const Empty: Story = {
  name: 'Empty — renders nothing',
  args: {
    items: [],
  },
}

// --- Deep four-level chain ---
export const Deep: Story = {
  name: 'Deep chain (4 levels)',
  args: {
    items: [
      { label: 'Home',           path: '/' },
      { label: 'stellar-org',    path: '/orgs/stellar-org' },
      { label: 'Issue #101',     path: '/orgs/stellar-org/issues/101' },
      { label: 'GBXXX1AB…MNO45' },
    ],
  },
}
