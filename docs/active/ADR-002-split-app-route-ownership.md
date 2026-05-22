# ADR-002: Split-App Route Ownership

Status: Accepted  
Date: 2026-05-21

## Context

PaperEdge currently has two active application surfaces:

- `apps/dashboard` for locked paper-trade tracking, settlement, books, bankroll, and performance review.
- `apps/verifier` for opportunity import, manual verification workflow, deep-link helpers, and extension-facing APIs.

The repository also contains a root `app/` Next app. In code, this root app is a launcher page only (`app/page.tsx`) that points users to dashboard and verifier.

There is a documentation conflict:

- `docs/PAPEREDGE_BUILD_PLAN.md` describes a cockpit-at-root direction (`/` as the primary product surface).
- Current code, tracker, and README are split-app launcher-first.

This ADR resolves that conflict for current delivery work.

## Decision

PaperEdge’s canonical architecture is **split-app with a root launcher**.

- Root `app/` remains launcher-only and does not host production trade workflows.
- `apps/dashboard` owns post-lock lifecycle and performance analysis.
- `apps/verifier` owns pre-lock lifecycle and verification APIs.

This decision is authoritative for all agent work until superseded by a new ADR.

## Route Ownership

1. Root app (`app/`, default port from root `npm run dev`)
- Owns `/` launcher UI and safety disclaimer only.
- Must not own import, verification, lock, settlement, or analytics domain logic.

2. Dashboard app (`apps/dashboard`, typically `http://localhost:3000`)
- Owns locked paper trades, trade detail/review, settlement screens, P/L, mistakes, books, settings, and exports.
- May read verification outcomes, but does not own extension-facing verifier APIs.

3. Verifier app (`apps/verifier`, typically `http://localhost:3001`)
- Owns import queue, verification queue, book deep links, lock promotion APIs, and extension API endpoints.
- Owns verification boundary hardening (CORS/origin checks, request validation).

## Ownership Rules

1. Shared domain logic lives in `packages/core`.
2. Prisma schema/client ownership lives in `packages/database`.
3. Root `lib/` must remain limited to app-specific helpers that do not violate route ownership.
4. Any new feature must declare one app owner (`dashboard` or `verifier`) before implementation.
5. Cross-app behavior must integrate through shared packages and persisted data, not duplicated UI workflows.

## Consequences

1. Workstream priority stays aligned with verification-first lifecycle without collapsing into a single overloaded app.
2. Build-plan sections that require cockpit-at-root are treated as historical direction unless re-approved by a future ADR.
3. Future architecture changes must update:
- this ADR (or superseding ADR),
- `docs/active/PROJECT_COMPLETION_TRACKER.md`,
- `AGENTS.md` live planning references.

