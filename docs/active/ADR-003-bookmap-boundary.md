# ADR-003: Bookmap Boundary

Date: 2026-05-21  
Status: Accepted

## Context

The repository contains `bookmap/` with its own app stack and data store:

- Separate package scripts and dependencies in `bookmap/package.json`
- Separate SQLite files in `bookmap/data/`
- Separate server/client runtime under `bookmap/server` and `bookmap/client`

PaperEdge already has its own split-app architecture (`apps/dashboard`, `apps/verifier`) and shared packages (`packages/core`, `packages/database`).

## Decision

Treat `bookmap/` as an isolated product boundary for this phase.

- No direct runtime dependency from PaperEdge apps/packages to `bookmap/`
- No shared database files between PaperEdge and Bookmap
- No Bookmap routes/components mixed into PaperEdge app trees
- Any future integration must be explicit and planned as a separate scoped change

## Consequences

- Current PaperEdge completion work stays focused on dashboard/verifier/core/database scopes.
- Agents can ignore `bookmap/` for PaperEdge feature work unless a task explicitly targets Bookmap.
- Merge conflict and accidental coupling risk is reduced.
