import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActivityProgressRing } from '../components/ActivityProgressRing';

const meta = {
  title: 'Components/ActivityProgressRing',
  component: ActivityProgressRing,
  tags: ['autodocs'],
  args: { max: 4 },
  parameters: {
    docs: {
      description: {
        component: 'Shows weekly completion progress around a daily streak counter. Change value in Controls to see the 800 ms transition. Enable reduced motion in your OS or browser to see instant updates.',
      },
    },
  },
} satisfies Meta<typeof ActivityProgressRing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { value: 0, streakDays: 0, badgeLevel: 'bronze' } };
export const Bronze: Story = { args: { value: 1, streakDays: 3, badgeLevel: 'bronze' } };
export const Silver: Story = { args: { value: 2, streakDays: 7, badgeLevel: 'silver' } };
export const Gold: Story = { args: { value: 3, streakDays: 14, badgeLevel: 'gold' } };
export const Platinum: Story = { args: { value: 4, streakDays: 30, badgeLevel: 'platinum' } };
