import type { Meta, StoryObj } from '@storybook/react-vite';
import TxConfirmModal from '../components/TxConfirmModal';
import { useTxModal } from '../hooks/useTxModal';

function KeyboardDemo() {
  const modal = useTxModal();

  async function openReview() {
    try {
      await modal.confirm({
        action: 'Apply for issue',
        target: 'Issue #42',
        fee: '0.00001 XLM',
        network: 'testnet',
      });
    } finally {
      modal.close();
    }
  }

  return (
    <>
      <button type="button" onClick={() => void openReview().catch(() => {})}>
        Review transaction
      </button>
      <button type="button">Background action</button>
      <TxConfirmModal modal={modal} />
    </>
  );
}

const meta = {
  title: 'Components/TxConfirmModal',
  component: TxConfirmModal,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        story: 'Open the review, use Tab and Shift+Tab to cycle between the buttons, then press Escape to return focus to the trigger.',
      },
    },
  },
} satisfies Meta<typeof TxConfirmModal>;

export default meta;

export const KeyboardNavigation: StoryObj = {
  render: () => <KeyboardDemo />,
};
