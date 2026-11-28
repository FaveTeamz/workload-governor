import type { Preview } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext, type ThemePreference } from "../src/context/ThemeContext";
import en from "../src/locales/en.json";
import "../src/tokens.css";
import "../src/app.css";

const storyI18n = createInstance();
void storyI18n.init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

function StoryTheme({ initial, children }: { initial: ThemePreference; children: ReactNode }) {
  const [preference, setPreference] = useState(initial);
  const dark = preference === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : preference !== "light";
  const theme = dark ? "dark" : "light";
  return (
    <ThemeContext.Provider value={{
      preference,
      theme,
      setPreference,
      toggle: () => setPreference(dark ? "light" : "dark"),
    }}>
      <div data-theme={preference} style={{ color: "var(--color-text)", background: "var(--color-bg)" }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}


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
  decorators: [
    (Story, { globals }) => (
      <StoryTheme key={globals.theme} initial={globals.theme ?? "system"}>
        <I18nextProvider i18n={storyI18n}>
          <MemoryRouter>
            <Story />
          </MemoryRouter>
        </I18nextProvider>
      </StoryTheme>
    ),
  ],
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
  initialGlobals: { theme: "system", backgrounds: { value: "dark" } },
};

export default preview;
