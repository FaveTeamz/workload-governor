import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'

const meta: Meta<typeof Modal> = {
  title:     'Design System/Modal',
  component: Modal,
  tags:      ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Modal>

function ModalDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <Modal
        open={open}
        title="Confirm Action"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost"     onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary"   onClick={() => setOpen(false)}>Confirm</Button>
          </>
        }
      >
        Are you sure you want to proceed with this action?
      </Modal>
    </>
  )
}

export const Default: Story = { render: () => <ModalDemo /> }
