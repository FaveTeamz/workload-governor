import type { Meta, StoryObj } from '@storybook/react'
import { ExportButton } from '../components/ExportButton'
import '../../../frontend/src/app.css'

const meta: Meta<typeof ExportButton> = {
  title:     'Design System/ExportButton',
  component: ExportButton,
  tags:      ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Export button for contributor profile print and PDF export (issue #664). Uses browser print-to-PDF — no server-side generation required.',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof ExportButton>

export const Default: Story = {
  args: {
    walletAddress: 'GBXXX1ABCDEFGHIJKLMNO12345',
  },
}

export const WithoutWallet: Story = {
  args: {},
}
