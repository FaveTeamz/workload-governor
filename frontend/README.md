# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Internationalization (i18n) Setup

Internationalization is powered by `i18next` and `react-i18next`, with browser language detection via `i18next-browser-languagedetector`.

### Structure
- Config file: `frontend/src/i18n.ts`
- Translation locale files: `frontend/src/locales/`
  - `en.json`: Baseline English locale strings
  - `es.json`: Spanish locale strings
- Date formatting: `frontend/src/utils/formatDate.ts` using `Intl.DateTimeFormat` with active i18n language context.

### Features
- **Auto-detection**: Automatically detects user browser language preference with fallback to English (`en`).
- **Language Switcher**: Switch active UI language dynamically in Settings (`SettingsPage.tsx`).
- **Pluralization**: Count-dependent strings utilize i18next pluralization rules (e.g. `counts.slot_one` vs `counts.slot_other`).
- **Date Formatting**: `formatDate()` formats timestamps using `Intl.DateTimeFormat` adhering to the selected locale.

