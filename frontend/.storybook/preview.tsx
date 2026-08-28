import type { Preview } from '@storybook/react-vite';
import '../src/tokens.css';
import '../src/app.css';
import type { Preview } from '@storybook/react-vite'
import '../src/tokens.css'
import '../src/app.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark',  value: '#0f1117' },
        { name: 'light', value: '#f8fafc' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
        date:  /Date$/i,
      },
    },
    a11y: { test: 'error' },
  },
}

export default preview
