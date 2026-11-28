import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkloadGauge } from '../components/WorkloadGauge';

const meta = {
  title: 'Design System/WorkloadGauge',
  component: WorkloadGauge,
  tags: ['autodocs'],
  args: {
    current: 12,
    max: 15,
    label: 'Applications pending',
  },
  argTypes: {
    current: { control: { type: 'number', min: 0 } },
    max: { control: { type: 'number', min: 1 } },
  },
} satisfies Meta<typeof WorkloadGauge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AtCapacity: Story = { args: { current: 15 } };
