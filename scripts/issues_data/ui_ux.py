# Category 6: Design System, UI/UX & Storybook - 10 issues

UI_UX_ISSUES = [
    {
        "title": "fix(design-system): Ensure Storybook builds cleanly with all autodocs tags enabled",
        "labels": ["bug", "storybook", "frontend"],
        "body": """### 🎯 Summary & Context
In `frontend/.storybook/main.ts` and component stories (`frontend/src/stories/`), enabling `tags: ['autodocs']` on complex interactive components (such as `WorkloadGauge.stories.tsx` and `IssueCard.stories.tsx`) causes Storybook build failures.

Automated documentation generation in Storybook is required for maintainers and designers to inspect component prop types, variants, and design token mappings in isolated environments.

### 🔍 Current Behavior & Root Cause
Storybook docgen parser (`react-docgen-typescript`) fails when parsing complex union types or custom CSS module imports, throwing `Error: Cannot find module` or producing blank documentation tables in Storybook static builds (`npm run build-storybook`).

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/.storybook/main.ts`:
   - Configure `typescript.reactDocgen`:
     ```typescript
     typescript: {
       check: false,
       reactDocgen: 'react-docgen-typescript',
       reactDocgenTypescriptOptions: {
         shouldExtractLiteralValuesFromEnum: true,
         propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
       },
     }
     ```
2. Verify all stories declare canonical default exports with `tags: ['autodocs']`.
3. Fix missing mock providers in `.storybook/preview.tsx` (Theme context, I18n provider, MemoryRouter).

### 📁 Affected Files & Modules
- `frontend/.storybook/main.ts`: Storybook configuration
- `frontend/.storybook/preview.tsx`: Storybook decorator wrappers
- `frontend/src/stories/*.stories.tsx`: Component story files

### ✅ Acceptance Criteria
- [ ] `npm run build-storybook` completes with zero errors.
- [ ] Autodocs tables render correct prop types, default values, and descriptions for all components.
- [ ] Interactive controls work in Storybook canvas for WorkloadGauge, IssueCard, and Button.

### 🧪 Testing & Verification Plan
- Run `npm run build-storybook` in `frontend/`.
- Verify static build output directory `storybook-static/` can be served locally.

### 🔒 Security, Reliability & Performance Considerations
Ensures design system component contracts remain stable across frontend engineering teams."""
    },
    {
        "title": "fix(ui-ux): Address WCAG 2.1 AA accessibility contrast failures on WorkloadGauge text",
        "labels": ["bug", "ui-ux", "accessibility"],
        "body": """### 🎯 Summary & Context
An automated accessibility audit documented in `docs/ACCESSIBILITY_AUDIT.md` flagged that text elements inside the `WorkloadGauge` component fail WCAG 2.1 AA contrast ratio requirements.

Specifically, the muted subtitle text ('12 / 15 applications pending') against dynamic background gauge fills has a contrast ratio of only 3.2:1, failing the required minimum of 4.5:1 for standard body text.

### 🔍 Current Behavior & Root Cause
In `frontend/src/components/WorkloadGauge.tsx` and `tokens.css`:
The secondary label uses color variable `var(--color-text-muted)` (#8892B0) rendered over light gradient circular progress rings, causing poor readability for visually impaired users.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/tokens.json` and `tokens.css`:
   - Adjust `--color-text-muted` or introduce high-contrast gauge text token `--color-gauge-text`: `#4A5568` in light mode and `#E2E8F0` in dark mode.
2. In `frontend/src/components/WorkloadGauge.tsx`:
   - Ensure all text elements achieve at least 4.5:1 contrast against both light and dark backgrounds.
   - Add `aria-live="polite"` and `role="progressbar"` with `aria-valuenow="12"` and `aria-valuemax="15"` for screen readers.
3. Update `docs/ACCESSIBILITY_AUDIT.md` resolving the recorded violation.

### 📁 Affected Files & Modules
- `frontend/src/components/WorkloadGauge.tsx`: Component structure and ARIA attributes
- `frontend/src/tokens.json`: Color tokens
- `frontend/src/tokens.css`: CSS variables
- `docs/ACCESSIBILITY_AUDIT.md`: Audit report update

### ✅ Acceptance Criteria
- [ ] Text contrast ratio in WorkloadGauge exceeds 4.5:1 under both light and dark themes.
- [ ] Screen readers announce progress bar values via ARIA attributes.
- [ ] Axe DevTools / Lighthouse Accessibility audit returns zero contrast violations on gauge.

### 🧪 Testing & Verification Plan
- Run Playwright axe-core automated audit on dashboard page.
- Verify color contrast using Chrome DevTools Color Picker.

### 🔒 Security, Reliability & Performance Considerations
Guarantees inclusive design and legal compliance with WCAG 2.1 AA accessibility standards."""
    },
    {
        "title": "feat(design-system): Add keyboard navigation and focus trapping to TxConfirmModal",
        "labels": ["enhancement", "design-system", "accessibility"],
        "body": """### 🎯 Summary & Context
When `TxConfirmModal` opens for users to review transaction details before signing, keyboard focus is not trapped inside the modal dialog. Users navigating via keyboard (`Tab` / `Shift+Tab`) can tab out of the dialog into background page elements.

In addition, pressing `Escape` does not dismiss the modal, violating standard modal accessibility requirements.

### 🔍 Current Behavior & Root Cause
In `frontend/src/components/TxConfirmModal.tsx`:
The modal is implemented as a plain `<div>` overlay without focus trap logic, `aria-modal="true"`, or keyboard event listeners for Escape.

### 🛠️ Proposed Solution & Technical Specification
1. Update `TxConfirmModal.tsx`:
   - Use `<dialog>` element or implement React focus trap hook `useFocusTrap`:
     - Upon opening, automatically shift focus to the first interactive element (Cancel or Confirm button).
     - Cycle `Tab` key focus strictly between dialog focusable elements.
     - Listen to `KeyDown` event: dismiss modal on `Escape` key.
     - Upon closing, restore focus to the triggering button.
   - Add ARIA attributes: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="tx-modal-title"`.

### 📁 Affected Files & Modules
- `frontend/src/components/TxConfirmModal.tsx`: Focus trap and ARIA integration
- `frontend/src/hooks/useFocusTrap.ts`: Reusable focus trap hook
- `frontend/src/stories/TxConfirmModal.stories.tsx`: Keyboard navigation story

### ✅ Acceptance Criteria
- [ ] Focus is locked inside modal while open.
- [ ] Pressing `Escape` cancels and closes the modal.
- [ ] Tabbing wraps from last button back to first element.
- [ ] Focus restored to triggering button on modal close.

### 🧪 Testing & Verification Plan
- Playwright E2E test exercising keyboard navigation inside modal.
- Screen reader testing with NVDA / VoiceOver.

### 🔒 Security, Reliability & Performance Considerations
Prevents accidental background interactions while confirming transactions with real financial consequences."""
    },
    {
        "title": "fix(ui-ux): Fix mobile viewport layout distortion on EventHistoryTable cards",
        "labels": ["bug", "ui-ux", "frontend"],
        "body": """### 🎯 Summary & Context
On mobile screens (<640px viewport width), the `EventHistoryTable` component overflows horizontally, causing page layout distortion, broken padding, and requiring horizontal scrolling across the entire dashboard.

Converting the table layout into responsive card viewports on mobile devices ensures an intuitive, readable experience on smartphones and tablets.

### 🔍 Current Behavior & Root Cause
In `frontend/src/components/EventHistoryTable.tsx` and `EventHistoryTable.css`:
The table uses fixed column widths with `min-width: 600px`. On 375px mobile screens, the viewport breaks and header elements become clipped.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/components/EventHistoryTable.css`:
   - Implement responsive CSS media queries `@media (max-width: 640px)`:
     - Hide standard table `<thead>`.
     - Display table rows `<tr>` as discrete card blocks (`display: flex; flex-direction: column; padding: 1rem; border-radius: 8px; margin-bottom: 0.75rem;`).
     - Render column titles via `::before` pseudo-elements reading `data-label="..."`.
2. Truncate long transaction hashes and Stellar public keys gracefully with copy-to-clipboard buttons.

### 📁 Affected Files & Modules
- `frontend/src/components/EventHistoryTable.tsx`: Card markup and data-labels
- `frontend/src/components/EventHistoryTable.css`: Responsive CSS rules
- `frontend/src/stories/EventHistoryTable.stories.tsx`: Mobile viewport stories

### ✅ Acceptance Criteria
- [ ] Zero horizontal page overflow on viewports between 320px and 640px.
- [ ] Transaction hashes and addresses truncated cleanly with copy buttons.
- [ ] Card layout renders all event details legibly on mobile devices.
- [ ] Desktop layout (>640px) remains unchanged as full table.

### 🧪 Testing & Verification Plan
- Test on 375px (iPhone SE) and 390px (iPhone 14) viewports in Playwright.
- Verify Storybook mobile viewport rendering.

### 🔒 Security, Reliability & Performance Considerations
Mobile contributors can track their transaction status on-the-go without UI friction."""
    },
    {
        "title": "feat(design-system): Add dark mode / high contrast color tokens to tokens.json",
        "labels": ["enhancement", "design-system"],
        "body": """### 🎯 Summary & Context
Developers using WorkloadGovernor in dark environments or with visual sensitivities have requested dark mode and high-contrast theme support. 

Currently, color values in `frontend/src/tokens.json` only define light mode hex codes, making them difficult to theme dynamically across CSS variables.

### 🔍 Current Behavior & Root Cause
In `frontend/src/tokens.json`:
Tokens are flat key-value pairs without color mode grouping (`light`, `dark`, `high-contrast`). Components hardcode white background colors in several CSS files.

### 🛠️ Proposed Solution & Technical Specification
1. Restructure `frontend/src/tokens.json` following Design Tokens Community Group (DTCG) specification:
   - Define semantic color tokens with `light` and `dark` themes:
     - `background.primary`, `background.surface`, `background.elevated`
     - `text.primary`, `text.secondary`, `text.muted`
     - `border.default`, `border.focus`
     - Status colors (`success`, `warning`, `error`, `info`)
2. In `frontend/src/tokens.css`:
   - Generate CSS custom properties scoped to `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`.
3. In `frontend/src/context/ThemeContext.tsx`:
   - Implement theme toggle hook `useTheme()` supporting `light`, `dark`, and `system` preferences with localStorage persistence.

### 📁 Affected Files & Modules
- `frontend/src/tokens.json`: Token definitions
- `frontend/src/tokens.css`: CSS custom variables
- `frontend/src/context/ThemeContext.tsx`: Theme provider
- `frontend/src/components/ThemeToggle.tsx`: Theme switch component

### ✅ Acceptance Criteria
- [ ] Dark mode theme tokens provide compliant contrast ratios (>4.5:1).
- [ ] Respects user\'s OS `prefers-color-scheme` by default.
- [ ] Theme toggle switch updates application theme instantaneously without page reload.
- [ ] Selected preference persists across browser sessions in localStorage.

### 🧪 Testing & Verification Plan
- Unit test theme toggle state switching and class application on `<html>` element.
- Visual inspection of all major components under dark mode in Storybook.

### 🔒 Security, Reliability & Performance Considerations
Zero CSS-in-JS runtime overhead; uses native CSS custom properties for instant rendering."""
    },
    {
        "title": "fix(ui-ux): Prevent layout shift during Skeleton screen loading transitions",
        "labels": ["bug", "ui-ux", "performance"],
        "body": """### 🎯 Summary & Context
When loading the organization issues list or contributor profile, skeleton loading screens (`IssueCardSkeleton`, `OrgCardSkeleton`) render with different heights and margins than the real populated components.

When the real data loads, the sudden height difference triggers a severe Cumulative Layout Shift (CLS score > 0.25), disorienting users and hurting SEO/performance scores.

### 🔍 Current Behavior & Root Cause
In `frontend/src/components/IssueCardSkeleton.tsx`:
Skeleton placeholder has height `140px` and no badge placeholders, whereas the populated `IssueCard.tsx` has height `188px` with tags and buttons. The 48px height difference pushes all subsequent content down abruptly upon data resolution.

### 🛠️ Proposed Solution & Technical Specification
1. Match skeleton dimensions exactly to populated components:
   - Measure actual DOM box dimensions of `IssueCard` in loaded state.
   - Update `IssueCardSkeleton.tsx` to include placeholder elements matching:
     - Issue title line (height, margin)
     - Tag chip placeholders (flex row with 3 chip skeletons)
     - Maintainer/time metadata footer
     - Action button placeholder
   - Set fixed min-height: `188px`.
2. Apply smooth opacity cross-fade transition (200ms) when swapping skeleton for content.

### 📁 Affected Files & Modules
- `frontend/src/components/IssueCardSkeleton.tsx`: Layout markup
- `frontend/src/components/IssueCardSkeleton.css`: Skeleton styling
- `frontend/src/pages/OrgIssuesPage.tsx`: Loading transition wrapper

### ✅ Acceptance Criteria
- [ ] CLS (Cumulative Layout Shift) score reduced to < 0.05 on page load.
- [ ] Skeleton placeholder dimensions match populated component within 2px.
- [ ] Smooth transition animation when replacing skeleton with data.

### 🧪 Testing & Verification Plan
- Measure CLS score using Chrome Lighthouse / Playwright performance metrics.
- Visual comparison test between skeleton and populated card.

### 🔒 Security, Reliability & Performance Considerations
Improves user perception of speed and eliminates accidental clicks on shifting buttons."""
    },
    {
        "title": "feat(design-system): Implement animated progress ring for ContributorActivity streak badge",
        "labels": ["enhancement", "design-system"],
        "body": """### 🎯 Summary & Context
In `ContributorActivity.tsx`, contributor assignment completion streaks and weekly activity are currently displayed as raw text strings ('Streak: 5 days', '3 tasks completed').

An engaging animated SVG progress ring and milestone badge visualizes contributor momentum and incentivizes active participation in Wave open-source tasks.

### 🔍 Current Behavior & Root Cause
Activity stats are rendered in plain text paragraphs with minimal visual hierarchy or celebration of completed milestones.

### 🛠️ Proposed Solution & Technical Specification
1. Create `frontend/src/components/ActivityProgressRing.tsx`:
   - SVG circular progress ring with stroke-dashoffset animation.
   - Props: `value: number`, `max: number`, `streakDays: number`, `badgeLevel: 'bronze' | 'silver' | 'gold' | 'platinum'`.
   - Smooth CSS transition on value changes (`transition: stroke-dashoffset 0.8s ease-in-out`).
   - Center slot rendering streak flame icon and numeric counter.
2. Integrate into `ContributorActivity.tsx` and create Storybook stories for all 4 milestone tiers.

### 📁 Affected Files & Modules
- `frontend/src/components/ActivityProgressRing.tsx`: New SVG progress ring
- `frontend/src/components/ContributorActivity.tsx`: Dashboard integration
- `frontend/src/stories/ActivityProgressRing.stories.tsx`: Storybook stories

### ✅ Acceptance Criteria
- [ ] Animated SVG progress ring smoothly reflects progress percentage.
- [ ] Different color schemes and milestone icons rendered based on tier.
- [ ] Respects `prefers-reduced-motion` media query by disabling animation.
- [ ] Full unit test coverage and Storybook documentation.

### 🧪 Testing & Verification Plan
- Storybook visual testing of progress values (0%, 25%, 50%, 75%, 100%).
- Verify animation is skipped when `prefers-reduced-motion` is active.

### 🔒 Security, Reliability & Performance Considerations
Pure SVG and CSS animations; zero heavy third-party animation library dependencies."""
    },
    {
        "title": "fix(storybook): Fix broken Chromatic visual regression test baseline on Button stories",
        "labels": ["bug", "storybook", "ci"],
        "body": """### 🎯 Summary & Context
The Chromatic visual regression test workflow in CI (`.github/workflows/chromatic.yml`) is currently failing due to uncommitted baseline changes on the `Button` component stories (`Button.stories.tsx`).

Unresolved visual diffs block automated pull request checks and prevent reliable visual regression verification on new UI contributions.

### 🔍 Current Behavior & Root Cause
Recent updates to font families and focus ring styling in `tokens.css` caused Chromatic to detect 1px border differences on button focus states. Because the new baseline was never formally accepted, the Chromatic CI step exits with non-zero status.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/stories/Button.stories.tsx`:
   - Ensure all Button variants (`primary`, `secondary`, `danger`, `outline`) have stable deterministic rendering (disable active cursor blink or dynamic animations during capture).
   - Add Chromatic parameters to pause animations during screenshot capture:
     ```typescript
     parameters: {
       chromatic: { delay: 300, pauseAnimationAtEnd: true },
     }
     ```
2. Run Chromatic baseline update command with project token to accept canonical visual baseline.
3. Update `.github/workflows/chromatic.yml` to only run visual regression tests on relevant frontend file changes.

### 📁 Affected Files & Modules
- `frontend/src/stories/Button.stories.tsx`: Story stabilization
- `.github/workflows/chromatic.yml`: Workflow trigger conditions
- `docs/visual-regression.md`: Visual testing guidelines

### ✅ Acceptance Criteria
- [ ] Button stories render deterministically in Chromatic test environment.
- [ ] Chromatic CI check passes with green status on pull requests.
- [ ] Baseline differences are approved and documented.

### 🧪 Testing & Verification Plan
- Run Chromatic build locally via `npx chromatic --dry-run`.
- Verify green check in GitHub Actions workflow run.

### 🔒 Security, Reliability & Performance Considerations
Ensures fast, reliable feedback loop for designers and developers during code review."""
    },
    {
        "title": "feat(ui-ux): Add toast notification queue with auto-dismiss countdown timer",
        "labels": ["enhancement", "ui-ux"],
        "body": """### 🎯 Summary & Context
When users perform multiple actions in quick succession (e.g. copying issue URLs, withdrawing applications, refreshing balances), toast alerts currently overwrite each other immediately. If an error toast appears and is replaced a fraction of a second later by a success toast, the user never sees the error.

Implementing a stacking toast notification queue with an auto-dismiss countdown timer bar and manual close controls ensures no critical notifications are lost.

### 🔍 Current Behavior & Root Cause
In `frontend/src/context/ToastContext.tsx`:
The state holds a single toast object `toast: Toast | null`. Calling `showToast` replaces the active toast instantly.

### 🛠️ Proposed Solution & Technical Specification
1. Refactor `ToastContext.tsx`:
   - Store an array of toasts: `toasts: ToastItem[]` (max 5 simultaneous toasts).
   - Each toast has: `id: string`, `type: 'success' | 'error' | 'warning' | 'info'`, `title: string`, `message?: string`, `duration: number (default 5000ms)`.
2. Create `frontend/src/components/ToastContainer.tsx`:
   - Renders toasts stacked vertically in bottom-right (or top-right) corner.
   - Shows an animated shrinking countdown progress bar along the bottom edge of each toast.
   - Pauses auto-dismiss countdown when user hovers their mouse over the toast.
   - Close 'X' button with keyboard accessibility.

### 📁 Affected Files & Modules
- `frontend/src/context/ToastContext.tsx`: Queue state management
- `frontend/src/components/ToastContainer.tsx`: Visual toast queue renderer
- `frontend/src/components/Toast.tsx`: Individual toast item component
- `frontend/src/stories/Toast.stories.tsx`: Toast variant stories

### ✅ Acceptance Criteria
- [ ] Multiple toasts stack orderly without overwriting previous messages.
- [ ] Auto-dismiss timer progress bar visually indicates remaining display time.
- [ ] Hovering mouse pauses auto-dismiss countdown.
- [ ] Toasts announce to screen readers via `aria-live="assertive"` (errors) or `aria-live="polite"` (info).

### 🧪 Testing & Verification Plan
- Unit test queuing 4 simultaneous toasts and verifying auto-dismiss timing.
- Test pause-on-hover behavior.

### 🔒 Security, Reliability & Performance Considerations
Ensures error details and transaction hashes remain visible long enough for users to read and copy."""
    },
    {
        "title": "fix(ui-ux): Ensure all interactive icon buttons have explicit aria-label attributes",
        "labels": ["bug", "ui-ux", "accessibility"],
        "body": """### 🎯 Summary & Context
Several interactive icon buttons across the application (such as the copy transaction hash button, bookmark toggle star, modal close cross, and filter reset button) render raw SVG icons without nested text or `aria-label` attributes.

Screen reader users hear only 'button' with zero indication of what clicking the button will do, creating a major accessibility barrier.

### 🔍 Current Behavior & Root Cause
In `frontend/src/components/OrgSelector.tsx`, `EventHistoryTable.tsx`, and `IssueCard.tsx`:
`<button onClick={...}><CopyIcon /></button>`
Lacks `aria-label` or inner `<span className="sr-only">`.

### 🛠️ Proposed Solution & Technical Specification
1. Audit all `<button>` and `<IconButton>` elements across `frontend/src/components/`:
   - Add explicit, localized `aria-label` attribute describing action and target:
     - `aria-label="Copy transaction hash to clipboard"`
     - `aria-label="Close transaction confirmation dialog"`
     - `aria-label="Bookmark organization ${orgName}"`
     - `aria-label="Reset search and filter criteria"`
2. Add an ESLint accessibility rule (`eslint-plugin-jsx-a11y/control-has-associated-label`) to fail builds if icon buttons lack accessible text.

### 📁 Affected Files & Modules
- `frontend/src/components/*.tsx`: Add missing aria-labels
- `frontend/.eslintrc.json`: Add jsx-a11y lint rule
- `docs/ACCESSIBILITY_AUDIT.md`: Accessibility compliance checklist update

### ✅ Acceptance Criteria
- [ ] Every button without visible text has an informative `aria-label`.
- [ ] Dynamic values (such as org name or issue ID) are included in labels.
- [ ] Axe accessibility audit reports zero unlabeled button violations.
- [ ] ESLint automatically enforces rule on future PRs.

### 🧪 Testing & Verification Plan
- Run `npm run lint` with `jsx-a11y` enabled.
- Run automated Playwright accessibility audit across all application views.

### 🔒 Security, Reliability & Performance Considerations
Guarantees full WCAG 2.1 compliance for assistive technology users."""
    }
]
