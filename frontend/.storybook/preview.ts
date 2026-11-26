import type { Preview } from "@storybook/react";
import "../src/tokens.css";
import "../src/app.css";
import "../src/i18n"; // ensure i18next is initialised for all stories

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        dark: { name: "Dark", value: "#0f1117" },
        light: { name: "Light", value: "#f8fafc" },
      },
    },
    a11y: { test: "todo" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      viewports: {
        mobile1: {
          name: "Mobile (375px)",
          styles: { width: "375px", height: "667px" },
        },
        mobile2: {
          name: "Mobile (390px)",
          styles: { width: "390px", height: "844px" },
        },
        tablet: {
          name: "Tablet (768px)",
          styles: { width: "768px", height: "1024px" },
        },
        desktop: {
          name: "Desktop (1280px)",
          styles: { width: "1280px", height: "800px" },
        },
      },
    },
  },
  initialGlobals: { backgrounds: { value: "dark" } },
};

export default preview;
