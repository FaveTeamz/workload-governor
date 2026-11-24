# Category 5: Frontend Application & State Management - 11 issues

FRONTEND_ISSUES = [
    {
        "title": "fix(frontend): Resolve React 18 and @types/react 19 version mismatch in package.json",
        "labels": ["bug", "frontend"],
        "body": """### 🎯 Summary & Context
In `frontend/package.json`, runtime dependencies specify React 18 (`react: ^18.3.1`, `react-dom: ^18.3.1`), but `devDependencies` specify `@types/react: ^19.0.0` and `@types/react-dom: ^19.0.0`.

This major version mismatch causes severe TypeScript compilation errors, broken JSX typing (e.g. `ReactNode` type incompatibility, `ref` typing shifts in React 19), and IDE errors across all frontend components.

### 🔍 Current Behavior & Root Cause
In `frontend/package.json`:
Running `npm run typecheck` or `npx tsc --noEmit` produces errors such as:
`Type 'ReactNode' is not assignable to type 'ReactElement'`
due to React 19 type definitions expecting different JSX transform and ref semantics than React 18.

### 🛠️ Proposed Solution & Technical Specification
1. Align `@types/react` and `@types/react-dom` to the matching React 18 release:
   - Update `frontend/package.json`:
     `"@types/react": "^18.3.12"`,
     `"@types/react-dom": "^18.3.1"`.
2. Delete `node_modules` and re-run `npm install` in `frontend/` to regenerate a clean `package-lock.json`.
3. Verify that `npm run build` and `npm run typecheck` compile with zero TypeScript diagnostic errors.

### 📁 Affected Files & Modules
- `frontend/package.json`: Dependencies specification
- `frontend/package-lock.json`: Dependency tree lock
- `frontend/tsconfig.json`: TypeScript compiler options

### ✅ Acceptance Criteria
- [ ] `@types/react` and `@types/react-dom` match runtime React 18 version.
- [ ] `npm run typecheck` passes with zero errors.
- [ ] All JSX component props and hooks compile cleanly.
- [ ] CI workflow `frontend-ci.yml` passes without type warnings.

### 🧪 Testing & Verification Plan
- Run `npm run typecheck` in `frontend/`.
- Run `npm run build` to verify Vite/Next bundling succeeds.

### 🔒 Security, Reliability & Performance Considerations
Eliminates build-time instability and ensures consistent IDE autocompletion for all developers."""
    },
    {
        "title": "fix(frontend): Deduplicate duplicate vitest dependency in frontend package.json",
        "labels": ["bug", "frontend"],
        "body": """### 🎯 Summary & Context
In `frontend/package.json`, the `vitest` dependency is declared twice with potentially conflicting version specifications across `dependencies` and `devDependencies`.

Duplicate dependency declarations confuse package managers (npm, pnpm), cause indeterminate package resolution, and bloat the lockfile.

### 🔍 Current Behavior & Root Cause
Inspecting `frontend/package.json` shows `vitest` listed under both `dependencies` and `devDependencies`. As a test runner, Vitest should only be located in `devDependencies`.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/package.json`:
   - Remove `vitest` from `dependencies`.
   - Ensure a single, pinned version (e.g. `vitest: ^2.1.0`) exists under `devDependencies`.
2. Run `npm install --package-lock-only` in `frontend/` to clean `package-lock.json`.
3. Verify that running `npm test` executes the Vitest test runner without issues.

### 📁 Affected Files & Modules
- `frontend/package.json`: Dependency cleanup
- `frontend/package-lock.json`: Lockfile update

### ✅ Acceptance Criteria
- [ ] `vitest` declared exactly once under `devDependencies`.
- [ ] Removed from production `dependencies`.
- [ ] `npm test` runs successfully.
- [ ] Lockfile updated cleanly.

### 🧪 Testing & Verification Plan
- Run `npm test` in `frontend/`.
- Run `npm ls vitest` and verify single instance resolution.

### 🔒 Security, Reliability & Performance Considerations
Prevents accidental inclusion of test runners and development tools into production frontend bundles."""
    },
    {
        "title": "fix(frontend): Consolidate split components directory between frontend/components and frontend/src/components",
        "labels": ["bug", "frontend", "architecture"],
        "body": """### 🎯 Summary & Context
The frontend codebase currently contains two separate components directories: `frontend/components/` and `frontend/src/components/`. Some components (like `IssueCard.tsx`) exist in both directories with slight variations, leading to duplicate code, divergent bug fixes, and import confusion.

Consolidating all UI components into a canonical directory structure (`frontend/src/components/`) simplifies architecture and ensures single source of truth.

### 🔍 Current Behavior & Root Cause
A legacy Next.js setup created `frontend/components/`, while the Vite / modern React application uses `frontend/src/components/`. Developers are unsure which component to import, resulting in mixed imports across pages and tests.

### 🛠️ Proposed Solution & Technical Specification
1. Compare component implementations between `frontend/components/` and `frontend/src/components/`.
2. Migrate any missing functionality, tests, or styling into `frontend/src/components/`.
3. Update all import paths across `frontend/src/pages/`, `frontend/src/App.tsx`, and `tests/` to reference `@/components/...` or relative `src/components/...`.
4. Delete the deprecated `frontend/components/` directory.
5. Update `tsconfig.json` path aliases (`"@/*": ["./src/*"]`).

### 📁 Affected Files & Modules
- `frontend/components/`: Deprecated directory removed
- `frontend/src/components/`: Canonical components directory
- `frontend/tsconfig.json`: Path alias configuration
- `frontend/src/pages/*.tsx`: Import path updates

### ✅ Acceptance Criteria
- [ ] Exactly one canonical components directory exists at `frontend/src/components/`.
- [ ] No duplicate component files remain in the repository.
- [ ] All component imports resolve cleanly with zero broken imports.
- [ ] `npm run build` and `npm test` pass 100%.

### 🧪 Testing & Verification Plan
- Execute `npm test` and `npm run build` in `frontend/`.
- Grep for imports referencing `../components/` vs `src/components/`.

### 🔒 Security, Reliability & Performance Considerations
Eliminates code duplication and prevents bugs where fixes applied to one copy of a component are not reflected in active user views."""
    },
    {
        "title": "fix(frontend): Consolidate Next.js and Vite configuration into single unified build pipeline",
        "labels": ["bug", "frontend", "architecture"],
        "body": """### 🎯 Summary & Context
The frontend directory currently contains both Next.js configuration (`next.config.js`, `frontend/app/`) and Vite configuration (`vite.config.ts`, `index.html`, `main.tsx`). Maintaining two parallel frameworks creates high cognitive overhead, duplicate scripts, conflicting environment variable prefixes (`NEXT_PUBLIC_` vs `VITE_`), and fragile CI pipelines.

Consolidating into a single canonical Vite Single Page Application (SPA) with fast HMR or pure Next.js application unifies developer experience and deployment.

### 🔍 Current Behavior & Root Cause
Developers run `npm run dev` which runs Vite, while Dockerfiles or CI scripts occasionally attempt `npm run build` invoking `next build`. This creates broken asset references and inconsistent environment variable handling.

### 🛠️ Proposed Solution & Technical Specification
1. Standardize on the active production framework (Vite SPA with React Router / Next.js).
2. Clean up legacy configuration files from the unused framework:
   - Remove orphaned config files (`next.config.js` or `vite.config.ts`).
   - Remove unused dependencies from `package.json`.
3. Standardize environment variable naming:
   - Use `VITE_` prefix (e.g. `VITE_HORIZON_URL`, `VITE_CONTRACT_ID`) consistently across `.env.example`, code, and Docker.
4. Update root `Makefile` targets (`make build-frontend`, `make dev-frontend`) to invoke the unified build command.

### 📁 Affected Files & Modules
- `frontend/package.json`: Unified build scripts
- `frontend/vite.config.ts` or `frontend/next.config.js`
- `frontend/.env.example`: Unified environment variables
- `Makefile`: Frontend build targets

### ✅ Acceptance Criteria
- [ ] Single build tool and framework configured across frontend.
- [ ] Orphaned configuration files and unused dependencies removed.
- [ ] Unified environment variable conventions documented in `.env.example`.
- [ ] `npm run build` produces production-ready distribution in `dist/`.

### 🧪 Testing & Verification Plan
- Run `npm run build` and test output with `npm run preview`.
- Verify environment variables load correctly in production build.

### 🔒 Security, Reliability & Performance Considerations
Reduces frontend Docker image size and prevents configuration drift between local development and production deployments."""
    },
    {
        "title": "fix(frontend): Replace dummy maintainer auth mock with real Soroban contract view call",
        "labels": ["bug", "frontend"],
        "body": """### 🎯 Summary & Context
In `frontend/src/pages/OrgIssuesPage.tsx` and maintainer action dialogs, the check determining whether the connected wallet user is an authorized maintainer currently uses a hardcoded client-side mock (`const isMaintainer = true;` or a dummy array comparison).

This allows any connected wallet user to see maintainer controls (like 'Assign Issue' and 'Complete Assignment') and submit transactions that inevitably fail on-chain with `ContractError::UnauthorizedMaintainer`.

### 🔍 Current Behavior & Root Cause
In `frontend/src/hooks/useMaintainerAuth.ts`:
The hook returns static mock data without querying the Soroban smart contract view function or backend API.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/hooks/useMaintainerAuth.ts`:
   - Query Soroban contract view function `is_maintainer(maintainer: Address, org_id: Symbol)` or backend endpoint `GET /api/orgs/:orgId/maintainers/:address`.
   - Manage loading, error, and authorized states cleanly:
     `{ isMaintainer: boolean, isLoading: boolean, error: Error | null }`.
2. Disable or hide maintainer action buttons (`Assign Issue`, `Revoke`, `Complete`) when `isMaintainer` is false.
3. Show an informational banner: 'Connected as Contributor (Read-Only Mode)' when user is not a registered maintainer.

### 📁 Affected Files & Modules
- `frontend/src/hooks/useMaintainerAuth.ts`: Real auth validation hook
- `frontend/src/pages/OrgIssuesPage.tsx`: Conditional UI rendering
- `frontend/src/horizon.ts`: Soroban RPC contract call helper
- `frontend/src/components/IssueCard.tsx`: Action button visibility

### ✅ Acceptance Criteria
- [ ] Wallet address is verified against contract maintainer state.
- [ ] Non-maintainer wallets do not see unauthorized action buttons.
- [ ] Loading state shown while maintainer status is being verified.
- [ ] Handles wallet disconnection and network switches cleanly.

### 🧪 Testing & Verification Plan
- Unit test hook with mocked RPC responses (maintainer = true and maintainer = false).
- Test UI toggles maintainer controls based on wallet address.

### 🔒 Security, Reliability & Performance Considerations
Improves user experience by preventing contributors from signing and paying gas fees for transactions destined to revert."""
    },
    {
        "title": "feat(frontend): Implement optimistic UI updates when applying for issues",
        "labels": ["enhancement", "frontend", "ui-ux"],
        "body": """### 🎯 Summary & Context
When a contributor clicks 'Apply for Issue', the transaction must be signed via Freighter wallet and submitted to the Stellar network, taking 3–6 seconds for ledger inclusion. During this waiting period, if the UI provides no feedback, users often click the button multiple times, submit duplicate transactions, or assume the app is frozen.

Implementing optimistic UI updates gives instant feedback, increments the user's workload gauge immediately, and shows a pending spinner with easy cancellation.

### 🔍 Current Behavior & Root Cause
`ApplyForIssueButton` shows a standard button state until the network transaction resolves completely. If the transaction takes several seconds, the UI appears unresponsive.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/hooks/useApplyForIssue.ts`:
   - Use TanStack Query (React Query) optimistic mutation pattern:
     - On mutation launch: snapshot previous state, immediately update application cache to `status: 'pending'`, and increment pending count in `WorkloadGauge`.
     - On mutation error: rollback to snapshot and display toast error notification with retry button.
     - On mutation success: invalidate queries and synchronize with canonical ledger event.
2. Update button component to show pulse animation and 'Transaction broadcasting to Stellar...' status message.

### 📁 Affected Files & Modules
- `frontend/src/hooks/useApplyForIssue.ts`: Optimistic mutation logic
- `frontend/src/components/ApplyForIssueButton.tsx`: Interactive state transitions
- `frontend/src/components/WorkloadGauge.tsx`: Optimistic counter update

### ✅ Acceptance Criteria
- [ ] UI reflects application as pending within 100ms of clicking apply.
- [ ] Contributor workload gauge optimistically updates immediately.
- [ ] If transaction is rejected in Freighter or reverts on-chain, UI state rolls back gracefully with error toast.
- [ ] Successful transaction confirms state without UI flicker.

### 🧪 Testing & Verification Plan
- Test optimistic update with mocked slow network connection (3000ms delay).
- Test rollback when transaction promise rejects.

### 🔒 Security, Reliability & Performance Considerations
Enhances perceived application performance and prevents accidental duplicate submission attempts."""
    },
    {
        "title": "fix(frontend): Prevent infinite re-render loop in useWallet hook on network change",
        "labels": ["bug", "frontend"],
        "body": """### 🎯 Summary & Context
In `frontend/src/context/WalletContext.tsx` and `useWallet.ts`, when a user switches network in Freighter (e.g. from Testnet to Futurenet or Mainnet), a state change triggers an infinite re-render loop in React.

This freezes the browser tab, exhausts CPU resources, and crashes the frontend application.

### 🔍 Current Behavior & Root Cause
In `WalletContext.tsx`:
An `useEffect` listens to window Freighter events or checks `await isAllowed()`. Inside the effect, state setter `setNetwork(network)` is called with an unmemoized object or without comparing previous network value. Because the effect has `[network]` in its dependency array, every state update triggers the effect again infinitely.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/context/WalletContext.tsx`:
   - Memoize network object or store network as primitive string ID (e.g. `PUBLIC`, `TESTNET`).
   - Add equality check before updating state:
     ```typescript
     if (prevNetwork !== newNetwork) {
       setNetwork(newNetwork);
     }
     ```
   - Use `useCallback` for wallet event handler callbacks.
2. Clean up event listeners in the effect cleanup return function when component unmounts.

### 📁 Affected Files & Modules
- `frontend/src/context/WalletContext.tsx`: Wallet provider and effect logic
- `frontend/src/hooks/useWallet.ts`: Hook interface
- `frontend/src/__tests__/WalletContext.test.tsx`: Network change test

### ✅ Acceptance Criteria
- [ ] Switching network in Freighter updates wallet context exactly once without infinite loops.
- [ ] Browser CPU usage remains normal on network switch.
- [ ] Component cleans up window listeners on unmount.
- [ ] Toast notification informs user: 'Network changed to Testnet'.

### 🧪 Testing & Verification Plan
- Unit test mocking repeated network change events in React Testing Library.
- Verify component render count is bounded.

### 🔒 Security, Reliability & Performance Considerations
Guarantees frontend stability across external wallet extension state transitions."""
    },
    {
        "title": "feat(frontend): Add local storage caching for organization bookmark list",
        "labels": ["enhancement", "frontend"],
        "body": """### 🎯 Summary & Context
Contributors frequently navigate between 2–4 specific organizations they actively contribute to. Currently, every time they visit the app, they must search or scroll through the entire list of organizations.

Allowing contributors to bookmark / favorite organizations with persistent local storage caching improves navigation efficiency.

### 🔍 Current Behavior & Root Cause
The organization list page only displays organizations sorted alphabetically or by activity, with no bookmarking or pin-to-top functionality.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/hooks/useBookmarkedOrgs.ts`:
   - Store bookmarked org IDs in browser `localStorage` under key `wg_bookmarked_orgs`.
   - Expose methods: `isBookmarked(orgId)`, `toggleBookmark(orgId)`, `bookmarkedOrgs`.
2. In `frontend/src/components/OrgCard.tsx` and `OrgSelector.tsx`:
   - Add a star / bookmark toggle icon button with `aria-label="Bookmark organization"`.
   - Render pinned 'Favorite Organizations' section at the top of the organization directory.

### 📁 Affected Files & Modules
- `frontend/src/hooks/useBookmarkedOrgs.ts`: New local storage hook
- `frontend/src/components/OrgCard.tsx`: Bookmark toggle button
- `frontend/src/pages/OrgListPage.tsx`: Favorites section layout

### ✅ Acceptance Criteria
- [ ] Clicking bookmark star toggles saved state in localStorage.
- [ ] Bookmarked organizations appear pinned at the top of the organization directory.
- [ ] Bookmarks persist across browser reloads and sessions.
- [ ] Gracefully handles disabled or full localStorage quotas.

### 🧪 Testing & Verification Plan
- Unit test hook toggling bookmarks and verifying localStorage contents.
- Verify bookmark state persists after page refresh.

### 🔒 Security, Reliability & Performance Considerations
Client-side only storage, zero additional database queries required."""
    },
    {
        "title": "fix(frontend): Improve error boundary fallback UI with retry button and error telemetry",
        "labels": ["bug", "frontend", "ui-ux"],
        "body": """### 🎯 Summary & Context
When an uncaught JavaScript runtime error occurs in a component subtree (such as unexpected null data from a third-party RPC), the React error boundary currently renders a blank screen or a harsh default error string.

A user-friendly error fallback screen with an explicit 'Try Again' button and automatic error telemetry reporting keeps users informed and aids rapid debugging.

### 🔍 Current Behavior & Root Cause
In `frontend/src/App.tsx`:
There is no top-level `ErrorBoundary` component, or the existing boundary does not provide state reset capabilities. A component failure results in a white screen of death.

### 🛠️ Proposed Solution & Technical Specification
1. Create `frontend/src/components/ErrorBoundary.tsx`:
   - Implement `componentDidCatch(error: Error, errorInfo: React.ErrorInfo)`:
     - Log error details to console and error telemetry endpoint (`/api/telemetry/errors`).
   - Render polished fallback UI:
     - Warning illustration icon.
     - User-friendly message: 'Something went wrong displaying this view'.
     - 'Reload View' button calling `this.setState({ hasError: false })`.
     - Collapsible technical error details for developer debugging.
2. Wrap key application routes in `App.tsx` with `ErrorBoundary`.

### 📁 Affected Files & Modules
- `frontend/src/components/ErrorBoundary.tsx`: New component
- `frontend/src/App.tsx`: Route wrapping
- `frontend/src/components/ErrorBoundary.css`: Fallback styling

### ✅ Acceptance Criteria
- [ ] Runtime errors are caught by ErrorBoundary without unmounting the whole application.
- [ ] User is presented with friendly fallback UI and 'Retry' button.
- [ ] Clicking retry resets component state.
- [ ] Error diagnostics logged with stack trace.

### 🧪 Testing & Verification Plan
- Create test component that throws on render and assert fallback UI is rendered.
- Verify clicking retry re-renders without full page reload.

### 🔒 Security, Reliability & Performance Considerations
Prevents isolated component errors from crashing the entire user application experience."""
    },
    {
        "title": "perf(frontend): Code-split route bundles and lazy-load heavy transaction modal components",
        "labels": ["performance", "frontend"],
        "body": """### 🎯 Summary & Context
The initial JavaScript bundle size of the frontend application is currently over 450 KB (gzipped), because heavy transaction confirmation modals (`TxConfirmModal`, `WithdrawConfirmModal`) and Stellar XDR serialization libraries are bundled into the main entry bundle.

Code-splitting route bundles and lazy-loading heavy modal dialogs reduces initial load time, improves Core Web Vitals (Largest Contentful Paint, First Input Delay), and saves bandwidth.

### 🔍 Current Behavior & Root Cause
In `frontend/src/App.tsx`:
All pages and modal components are imported statically at the top of the file:
`import { TxConfirmModal } from './components/TxConfirmModal';`
These libraries are parsed and compiled on page load even if the user never opens a modal dialog.

### 🛠️ Proposed Solution & Technical Specification
1. Implement dynamic code splitting using `React.lazy()` and `Suspense`:
   ```typescript
   const TxConfirmModal = React.lazy(() => import('./components/TxConfirmModal'));
   const WithdrawConfirmModal = React.lazy(() => import('./components/WithdrawConfirmModal'));
   const OrgIssuesPage = React.lazy(() => import('./pages/OrgIssuesPage'));
   ```
2. Wrap routes and lazy components in `<Suspense fallback={<LoadingSpinner />}>`.
3. Configure Vite / Webpack chunk splitting in `vite.config.ts`:
   - Separate vendor chunks: `stellar-sdk`, `@stellar/freighter-api`, `react-vendor`.

### 📁 Affected Files & Modules
- `frontend/src/App.tsx`: Lazy imports and Suspense boundaries
- `frontend/vite.config.ts`: Rollup output manualChunks configuration
- `frontend/src/components/LoadingSpinner.tsx`: Loading fallback

### ✅ Acceptance Criteria
- [ ] Main entry bundle size reduced by at least 35%.
- [ ] Heavy modal chunks are loaded on-demand only when modal is opened.
- [ ] Route navigation displays clean loading spinner without layout shifts.
- [ ] Production build generates separated vendor chunks in `dist/assets/`.

### 🧪 Testing & Verification Plan
- Run `npm run build` and inspect chunk sizes before and after optimization.
- Verify modal opens smoothly on slow 3G network simulation.

### 🔒 Security, Reliability & Performance Considerations
Improves performance for mobile contributors on slower internet connections."""
    },
    {
        "title": "fix(frontend): Handle Freighter wallet disconnection gracefully across active browser tabs",
        "labels": ["bug", "frontend"],
        "body": """### 🎯 Summary & Context
When a user has WorkloadGovernor open in multiple browser tabs and locks or disconnects their Freighter wallet extension in one tab, the other active tabs do not detect the disconnection.

Attempting to submit applications or approve assignments from a desynchronized tab results in confusing errors and stuck loading states.

### 🔍 Current Behavior & Root Cause
Wallet connection status is maintained in local component state without listening to browser storage events or Freighter connection change broadcasts across tabs.

### 🛠️ Proposed Solution & Technical Specification
1. In `frontend/src/context/WalletContext.tsx`:
   - Listen to `window.addEventListener('storage', (e) => { ... })` for cross-tab auth synchronization.
   - Periodically check wallet connection heartbeat using `isAllowed()` or `getAddress()` when tab regains focus (`window.addEventListener('focus', ...)`).
2. If wallet is disconnected in another tab:
   - Update wallet state to disconnected immediately.
   - Close open transaction modals.
   - Display a gentle notification: 'Wallet disconnected. Please reconnect to continue.'

### 📁 Affected Files & Modules
- `frontend/src/context/WalletContext.tsx`: Cross-tab sync listeners
- `frontend/src/hooks/useWallet.ts`: Disconnect state handling
- `frontend/src/components/WalletButton.tsx`: Button state update

### ✅ Acceptance Criteria
- [ ] Locking or disconnecting wallet in one tab updates all open tabs within 1 second.
- [ ] Open transaction dialogs close automatically upon wallet disconnection.
- [ ] Regaining tab focus verifies wallet authorization state.
- [ ] Zero unhandled exceptions when wallet disappears.

### 🧪 Testing & Verification Plan
- Simulate cross-tab storage event in tests and verify state updates to disconnected.
- Verify focus event triggers authorization check.

### 🔒 Security, Reliability & Performance Considerations
Prevents unauthorized action submissions from stale unattended browser sessions."""
    }
]
