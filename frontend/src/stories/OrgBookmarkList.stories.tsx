import type { Meta, StoryObj } from '@storybook/react'
import { OrgBookmarkList } from '../components/OrgBookmarkList'

const meta: Meta<typeof OrgBookmarkList> = {
  title:     'Components/OrgBookmarkList',
  component: OrgBookmarkList,
  tags:      ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof OrgBookmarkList>

const TEN_ORGS = [
  { id: 'stellar-org',    label: 'stellar-org' },
  { id: 'meridian-dao',   label: 'meridian-dao' },
  { id: 'soroban-tools',  label: 'soroban-tools' },
  { id: 'horizon-api',    label: 'horizon-api' },
  { id: 'albedo-wallet',  label: 'albedo-wallet' },
  { id: 'freighter-ext',  label: 'freighter-ext' },
  { id: 'galactic-dex',   label: 'galactic-dex' },
  { id: 'nebula-core',    label: 'nebula-core' },
  { id: 'pulsar-dao',     label: 'pulsar-dao' },
  { id: 'quasar-labs',    label: 'quasar-labs' },
]

export const Default: Story = {
  name: 'Default (10 orgs, no wallet)',
  args: {
    orgs:          TEN_ORGS,
    walletAddress: null,
  },
}

export const WithWalletAddress: Story = {
  name: 'Persisted order (wallet connected)',
  args: {
    orgs:          TEN_ORGS,
    walletAddress: 'GBXXX1ABCDEFGHIJKLMNO12345',
  },
}

export const FewOrgs: Story = {
  name: 'Few orgs (3)',
  args: {
    orgs: TEN_ORGS.slice(0, 3),
    walletAddress: null,
  },
}

export const WithOnSelect: Story = {
  name: 'With onSelect handler',
  args: {
    orgs:          TEN_ORGS,
    walletAddress: null,
    onSelect:      (org) => alert(`Selected: ${org.label}`),
  },
}
