# ADR-005: Use Next.js for the Frontend

**Status:** Accepted  
**Date:** 2024-02-05  
**Deciders:** Core team  
**Issue:** [#606](https://github.com/FaveTeamz/workload-governor/issues/606)

---

## Context

WorkloadGovernor needs a web frontend for contributors and maintainers to interact
with the platform without using the Stellar CLI. The frontend must:

1. Display the issue board with real-time application and assignment status.
2. Allow contributors to apply, withdraw, and monitor their applications.
3. Allow maintainers to assign, complete, and revoke assignments.
4. Integrate with the Freighter browser extension for Stellar transaction signing.
5. Be deployable as a static export to a CDN (S3 + CloudFront) for low latency
   and minimal hosting cost.

The team evaluated three approaches: a pure Single-Page Application (SPA) built
with Vite + React, a full-stack framework (Next.js), and Remix.

---

## Decision

**Use Next.js (App Router, version 14+)** for the frontend.

---

## Reasons

### 1. Server-Side Rendering (SSR) for first meaningful paint

The issue board is the primary landing page for new contributors. With a pure SPA,
the browser downloads JavaScript, executes it, fetches the API, then renders —
three sequential round trips before content appears. With Next.js SSR, the server
fetches the API and renders HTML in one round trip. For contributors on slower
connections or mobile devices, this difference is significant.

### 2. Static export for CDN deployment

Next.js supports `output: 'export'` to generate fully static HTML/CSS/JS that
can be served from S3 + CloudFront. This matches the deployment target and
eliminates the need for a persistent Node.js server for the frontend. The SSR
pages that need dynamic data use `revalidate` for ISR (Incremental Static
Regeneration) to keep content fresh without a live server.

### 3. Image optimisation and built-in performance primitives

Next.js ships `<Image>` (lazy loading, WebP conversion), `<Link>` (prefetching),
and Turbopack (fast dev builds) out of the box. These would require manual
configuration in a Vite SPA.

### 4. App Router and React Server Components

Next.js 14's App Router enables React Server Components, which can fetch data
on the server and send pre-rendered HTML to the client. For read-heavy pages
like the issue board this avoids client-side data-fetching waterfalls entirely.

### 5. Storybook compatibility and design system workflow

The design system (Button, Badge, Card, Modal, Table, Gauge components) is
developed with Storybook. Next.js has first-class Storybook support; the same
component library is used in both the Storybook sandbox and the production app
without configuration shims.

### 6. TypeScript first-class support

Next.js is built in TypeScript and generates typed route handlers. The team is
using TypeScript throughout the stack (backend + frontend), so consistent typing
across the boundary is important.

---

## Consequences

### Positive

- Fast first meaningful paint via SSR.
- Zero-server CDN deployment via static export.
- Built-in image optimisation, prefetching, and code splitting.
- Consistent TypeScript types across the stack.
- Strong Storybook integration for component-driven development.

### Negative

- Next.js App Router adds conceptual complexity (Server Components vs. Client
  Components, `'use client'` boundaries) that is unfamiliar to developers used to
  SPAs.
- The deployment model requires understanding when to use SSR, ISR, or full static
  export — not all pages can be statically exported if they depend on dynamic data.
- Next.js has a faster release cadence than Vite; minor version upgrades sometimes
  require small config changes.

### Neutral

- The responsive design breakpoints and dark mode behaviour are driven by CSS
  custom properties (design tokens in `frontend/src/tokens.css`), not by Next.js
  itself — the same approach would work in any React framework.

---

## Alternatives Considered

| Alternative | Reason rejected |
|-------------|----------------|
| Vite + React (SPA) | No SSR; three-round-trip waterfall for first paint; no built-in static export with ISR |
| Remix | Excellent DX but smaller ecosystem; less mature static export support at time of decision; team had more Next.js experience |
| SvelteKit | Great performance but requires Svelte knowledge; TypeScript support is good but ecosystem is smaller than React/Next.js for the Stellar/Freighter integration layer |
| Astro | Best for content-heavy sites; the issue board is highly interactive (real-time updates via WebSocket) which Astro handles less naturally than Next.js |
