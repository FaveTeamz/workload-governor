import type { Preview } from '@storybook/react-vite';
import '../src/tokens.css';
import '../src/app.css';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Application color theme',
      toolbar: {
        icon: 'contrast',
        items: [
          { value: 'system', title: 'System' },
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'high-contrast', title: 'High contrast' },
        ],
      },
    },
  },
  initialGlobals: { theme: 'system' },
  decorators: [
    (Story, { globals }) => (
      <div data-theme={globals.theme} style={{ color: 'var(--color-text)', background: 'var(--color-bg)' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: { test: 'todo' },
  },
};

export default preview;
