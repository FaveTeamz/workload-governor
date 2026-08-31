# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the WorkloadGovernor project. ADRs preserve the context and reasoning behind significant design decisions so that future contributors do not repeat already-settled discussions.

We follow the [MADR (Markdown Architectural Decision Records)](https://adr.github.io/madr/) format.

---

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-001](ADR-001-storage-key-design.md) | Soroban Storage Key Design | Accepted |

---

## When to write an ADR

Write an ADR when you are making a decision that:

- Affects a component that other teams or contributors depend on.
- Is difficult or expensive to reverse (storage layout, API contract, auth model).
- Requires choosing between two or more technically viable options.
- Would otherwise look arbitrary to a future reviewer with no context.

You do **not** need an ADR for:

- Routine implementation choices (variable names, test helper structure).
- Decisions that only affect internal code with no external contract.
- Changes that are trivially reversible.

---

## Template

Copy the template below to `docs/adr/ADR-XXX-<short-title>.md` and fill it in:

```markdown
# ADR-XXX — <Title>

| Field | Value |
|---|---|
| Status | Proposed / Accepted / Deprecated / Superseded |
| Date | YYYY-MM-DD |
| Authors | |
| Supersedes | — |
| Superseded by | — |
| Related docs | |

## Context

Describe the problem or situation that motivates this decision.

## Problem Statement

One sentence summary of the specific question being answered.

## Decision Drivers

List the constraints, goals, and non-goals that shaped the options.

## Alternatives Considered

### Alternative 1 — <name>

**Idea:** …

**Pros:**
- …

**Cons:**
- …

**Decision:** Rejected / Accepted because …

## Decision — <chosen approach>

Describe the chosen design in enough detail for a new contributor to implement it correctly.

## Consequences

### Positive
- …

### Negative / Trade-offs
- …

## References
- …
```

---

## Status lifecycle

| Status | Meaning |
|---|---|
| **Proposed** | Under discussion; not yet final |
| **Accepted** | Agreed upon and implemented |
| **Deprecated** | Was accepted but the situation changed; superseded ADR not yet written |
| **Superseded** | Replaced by a later ADR (link in the `Superseded by` field) |

---

## Contributing

1. Number ADRs sequentially (ADR-001, ADR-002, …).
2. Use lowercase kebab-case for the filename after the number prefix.
3. Update the index table in this README when adding or changing status.
4. Link the new ADR from the relevant implementation document (e.g. `docs/storage-design.md`).
