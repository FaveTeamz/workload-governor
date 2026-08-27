# Visual Regression Testing with Chromatic

WorkloadGovernor uses [Chromatic](https://www.chromatic.com/) to catch unintended visual changes to the design-system components. Every pull request that touches `frontend/` automatically captures pixel-level snapshots of all Storybook stories and compares them against the approved baseline.

---

## How it works

```
PR opened / pushed
        │
        ▼
.github/workflows/chromatic.yml
  1. npm ci
  2. npm run build-storybook   ← builds static Storybook bundle
  3. chromaui/action           ← uploads bundle, runs snapshot diff
        │
        ├── No visual changes → CI ✅ passes automatically
        │
        └── Visual changes detected → CI ❌ fails
                  │
                  ▼
           Reviewer visits Chromatic UI
           Accepts or rejects each diff
                  │
                  ├── All accepted → CI ✅ re-runs and passes
                  └── Any rejected → PR must be revised
```

Snapshots are taken in **two modes** for every story: `light` and `dark`. This doubles coverage and ensures token changes are caught in both colour schemes.

---

## Components covered

| Component | Stories | Variants captured |
|-----------|---------|-------------------|
| **Button** | `Button.stories.tsx` | Primary, Secondary, Ghost · sm/md/lg · Loading · Disabled · Dark |
| **Badge** | `Badge.stories.tsx` | Default, Success, Warning, Danger, Info · Dark |
| **Card** | `Card.stories.tsx` | Title-only, With subtitle, With footer, With badge · Dark |
| **Modal** | `Modal.stories.tsx` | Default, With footer, Long content · Dark |
| **Table** | `Table.stories.tsx` | Populated, Loading, Empty · Dark |
| **Gauge** | `Gauge.stories.tsx` | Low/Medium/High/Max/Empty usage · All thresholds grid · Dark |

---

## Initial setup (one-time, per repository)

### 1. Create a Chromatic project

1. Go to [chromatic.com](https://www.chromatic.com/) and sign in with GitHub.
2. Click **Add project** and select the `workload-governor` repository.
3. Chromatic will display a **Project token** — copy it.

### 2. Add the token to GitHub Secrets

1. In the GitHub repository, navigate to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Set:
   - **Name**: `CHROMATIC_PROJECT_TOKEN`
   - **Value**: the token copied above.
4. Click **Add secret**.

### 3. Capture the initial baseline

The first time the workflow runs it has nothing to compare against, so all stories are automatically accepted as the baseline. Push a commit that touches `frontend/` to trigger the workflow, then confirm in Chromatic that all stories are "accepted".

---

## Day-to-day PR review

### When Chromatic reports visual changes

1. Open the pull request on GitHub.
2. Find the **Chromatic** status check and click **Details** (or navigate directly to the Chromatic build URL in the check description).
3. In the Chromatic UI, review each diff:
   - **Green overlay** = pixels that were added.
   - **Red overlay** = pixels that were removed.
   - Toggle between "Diff", "New", and "Baseline" views to understand the change.
4. For each story:
   - Click **Accept** if the change is intentional (design update, token change, new variant).
   - Click **Deny** if the change is a regression that must be fixed before merging.
5. Once all stories are accepted, Chromatic re-triggers the GitHub status check and the PR can be merged.

### Accepting changes in bulk

If a broad refactor (e.g. renaming a CSS token) intentionally changes many stories, use the **Accept all** button at the top of the Chromatic build page. Add a comment on the PR explaining why all changes were accepted in bulk.

### When to deny a change

- A component renders differently than the design spec.
- A colour token was changed but the diff is in a component that should not have been affected.
- Text truncation, overflow, or layout shift appeared unexpectedly.
- The change is in a story that was not mentioned in the PR description.

---

## Workflow configuration details

File: `.github/workflows/chromatic.yml`

| Setting | Value | Reason |
|---------|-------|--------|
| `fetch-depth` | `0` (full) | Chromatic needs the full git history to detect ancestry and build accurate TurboSnap change graphs |
| `exitZeroOnChanges` | `true` on `main`, `false` on PRs | Merges to `main` auto-accept the new baseline; PRs block until diffs are reviewed |
| `onlyChanged` | `true` | Only re-snapshots stories whose source files changed — speeds up CI once the baseline is established |
| `storybookBuildDir` | `frontend/storybook-static` | Pre-built locally to separate build failures from visual diff failures |

---

## Running Storybook locally

```bash
cd frontend
npm install
npm run storybook          # starts dev server at http://localhost:6006
npm run build-storybook    # builds the static bundle to storybook-static/
```

---

## Adding a new component

1. Create the component in `frontend/src/components/design-system/`.
2. Export it from `frontend/src/components/design-system/index.ts`.
3. Create a `ComponentName.stories.tsx` alongside the component.
   - Include at minimum: a `Default` (light) story and a `DefaultDark` story.
   - Add a story per meaningful visual variant.
4. Open a PR — Chromatic will treat all new stories as "new" snapshots and ask for a one-time acceptance to establish the baseline.
5. Update this table above with the new component.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `CHROMATIC_PROJECT_TOKEN` not found | Add the secret under Settings → Secrets → Actions |
| Build step fails before Chromatic runs | Check Storybook TypeScript errors locally: `npm run build-storybook` |
| Flaky diffs on animated components | Add `chromatic: { pauseAnimationAtEnd: true }` to the story's `parameters` |
| Diffs from font rendering differences | Add `chromatic: { delay: 300 }` to allow web fonts to load |
| "No stories found" | Ensure `main.ts` glob `../src/**/*.stories.@(ts|tsx)` matches your file names |
| TurboSnap misses a changed story | The changed file may not be imported by a story — verify the import chain |

---

## Chromatic free-tier limits

The Chromatic free plan provides **5,000 snapshots per month**. Each story × mode (light/dark) counts as one snapshot. The current story set produces approximately 70–80 snapshots per build. This is well within the free tier for typical PR activity.

If the project grows beyond the free tier, consider:
- Using `--only-changed` (already enabled) to avoid re-snapping unchanged stories.
- Grouping related variants into a single "All variants" story instead of individual stories.
