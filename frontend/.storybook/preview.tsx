import type { Preview, Decorator } from "@storybook/react";
import "../src/components/design-system/design-system.css";

/**
 * Light/Dark theme decorator.
 *
 * Stories that want both modes set:
 *   parameters: { themes: { themeOverride: "light" | "dark" } }
 *
 * When Chromatic runs it captures snapshots for EACH item in
 * `chromatic.modes`, giving one baseline per theme.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.parameters as { themes?: { themeOverride?: string } })
    ?.themes?.themeOverride;
  return (
    <div
      data-theme={theme ?? "light"}
      style={{
        background:
          theme === "dark" ? "var(--ds-bg, #0f1117)" : "var(--ds-bg, #ffffff)",
        padding: "24px",
        minHeight: "100px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],

  parameters: {
    // Default snapshot modes for Chromatic — one capture per mode
    chromatic: {
      modes: {
        light: { theme: "light" },
        dark: { theme: "dark" },
      },
    },

    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#ffffff" },
        { name: "dark", value: "#0f1117" },
      ],
    },

    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
