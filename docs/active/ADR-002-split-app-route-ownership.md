# ADR-002: Dashboard-Only Route Ownership

Status: Accepted  
Date: 2026-05-22  
Supersedes: ADR-002 split-app launcher decision from 2026-05-21

## Context

PaperEdge previously operated as a split-app workspace:

- `apps/dashboard` for locked paper-trade tracking and review.
- `apps/verifier` for import, verification queue, deep links, and extension APIs.

Product direction has changed for this phase: only the dashboard app is required in active runtime flow. The verifier surface is removed from active runtime and repository app ownership.

## Decision

PaperEdge now uses a **dashboard-only runtime architecture**.

- `apps/dashboard` is the only active application surface.
- Root `app/` is redirect-only and sends users directly to the dashboard.
- Verifier runtime app code is removed from this repository.

This decision is authoritative for all agent work until superseded by a new ADR.

## Route Ownership

1. Root app (`app/`)
- Owns only `/` redirect behavior to the dashboard URL.
- Must not host product workflows or duplicate dashboard logic.

2. Dashboard app (`apps/dashboard`)
- Owns the active product surface for this phase.
- Owns trade lifecycle UX and supporting views used in current runtime.

3. Verifier runtime surface
- Removed in this phase.
- Any future reintroduction requires a new ADR and fresh implementation scope.

## Ownership Rules

1. Shared domain logic lives in `packages/core`.
2. Prisma schema/client ownership lives in `packages/database`.
3. New user-facing workflow work targets `apps/dashboard` only unless a new ADR reactivates verifier scope.
4. Any future verifier reintroduction must include explicit script, docs, and quality-gate updates.

## Consequences

1. Local startup is simplified to dashboard-first behavior.
2. Quality-gate expectations move to dashboard-only build validation.
3. Verifier runtime no longer exists in current repository layout.
