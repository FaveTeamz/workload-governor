# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for WorkloadGovernor.
An ADR captures the context, reasoning, and consequences of a significant
architectural or design decision, making it easier for future contributors to
understand *why* the project is built the way it is — not just *how*.

## Format

Each ADR uses the standard format: **Status**, **Context**, **Decision**,
**Reasons**, **Consequences**, and **Alternatives Considered**.
Use [ADR-TEMPLATE.md](ADR-TEMPLATE.md) when writing a new ADR.

## Status values

| Status | Meaning |
|--------|---------|
| `Proposed` | Under discussion, not yet accepted |
| `Accepted` | Decision is in effect |
| `Deprecated` | Previously accepted; no longer in effect |
| `Superseded by ADR-NNN` | Replaced by a newer decision |

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](ADR-001-soroban-over-evm.md) | Use Soroban (Stellar) Instead of an EVM-Compatible Chain | Accepted | 2024-01-15 |
| [ADR-002](ADR-002-global-cap-15.md) | Set the Global Pending Application Cap at 15 | Accepted | 2024-01-20 |
| [ADR-003](ADR-003-temporary-storage-applications.md) | Use Temporary Storage for Pending Applications | Accepted | 2024-01-22 |
| [ADR-004](ADR-004-postgresql-over-sqlite.md) | Use PostgreSQL Instead of SQLite for the Backend Database | Accepted | 2024-02-01 |
| [ADR-005](ADR-005-nextjs-frontend.md) | Use Next.js for the Frontend | Accepted | 2024-02-05 |

## Adding a new ADR

1. Copy `ADR-TEMPLATE.md` to `ADR-NNN-short-title.md` (use the next available number).
2. Fill in all sections.
3. Add a row to the index table above.
4. Add a row to the ADR table in `README.md` (root).
5. Open a pull request. ADRs require at least one reviewer from the core team.

## Further reading

- [Michael Nygard's original ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [adr.github.io](https://adr.github.io/) — tooling and templates
