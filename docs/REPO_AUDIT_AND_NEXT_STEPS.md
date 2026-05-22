# Repository Audit and Next Steps

## Current Status (2026-05-22)

This document is **historical context**.
The live source of truth is:

- `docs/active/PROJECT_COMPLETION_TRACKER.md`

Current state from the active tracker:

- Quality gates are green (`npm run validate` passes).
- Money-cents backfill is idempotent (`npm run db:backfill-money-cents` reports `0` updates on re-run).
- `P0` tasks are complete.
- `P1` tasks are complete.
- `P2` tasks are complete except ongoing session maintenance (`P2-01`).

## Immediate Next Step

1. Continue `P2-01`: keep tracker status and `Session Log` updated each coding session.

## Source Documents

- Completion tracker: `docs/active/PROJECT_COMPLETION_TRACKER.md`
- Route ownership ADR: `docs/active/ADR-002-split-app-route-ownership.md`
- Bookmap boundary ADR: `docs/active/ADR-003-bookmap-boundary.md`
- Build plan intent: `docs/PAPEREDGE_BUILD_PLAN.md`
- Quality gates: `docs/QUALITY_GATES.md`

## Archived Audit Snapshot (2026-05-21)

### Priority Legend

| Priority | Meaning |
|---|---|
| `P0` | Work before adding features. Could affect correctness, safety, or product direction. |
| `P1` | Work soon. Important for maintainability, security, or dev velocity. |
| `P2` | Work after `P0/P1`. Useful but not blocking the core loop. |
| `P3` | Later polish or expansion. |

### Findings Summary

| ID | Priority | Area | Finding | Impact | Effort | Current State |
|---|---|---|---|---|---|---|
| F-01 | P0 | Product architecture | Route/surface ownership ambiguity between legacy plan text and current app split | High | Medium | **Closed** via `ADR-002` |
| F-02 | P0 | Math correctness | Float-backed persisted money values | High | High | **Closed** via cents migration/backfill |
| F-03 | P0 | Verification | 10 verification gates should be first-class pure logic with tests | High | Medium | **Closed** |
| F-04 | P0 | Core verify logic | Recalc inputs/calculator validation needed hardening | High | Low | **Closed** |
| F-05 | P0 | API security | Deep-link route had wildcard CORS and weak validation | High | Low | **Closed** |
| F-06 | P1 | Generated artifacts | Generated/stale artifacts needed cleanup and ownership clarity | Medium | Low | **Closed** |
| F-07 | P1 | Tests | Behavioral coverage gaps for money-risking logic | High | Medium | **Closed for targeted scope** |
| F-08 | P1 | Dev experience | Quality-gate command surface not explicitly documented | Medium | Low | **Closed** (`docs/QUALITY_GATES.md`) |
| F-09 | P1 | Settlement | Settlement flow needed stronger transactional guarantees | High | Medium | **Closed** |
| F-10 | P1 | Local identity | Local user lookup duplicated across dashboard actions/routes | Medium | Low | **Closed** |
| F-11 | P1 | Extension safety | Verifier/extension trust boundary needed tightening | Medium | Low | **Closed** |
| F-12 | P1 | Domain modeling | Stringly-typed domain states needed shared contracts | Medium | Medium | **Closed** |
| F-13 | P2 | Bookmap boundary | Needed explicit integrate-vs-isolate decision | Medium | Medium | **Closed** via `ADR-003` |
| F-14 | P2 | Money parsing | Lenient parsing/formatting behavior risks unclear values | Medium | Low | **Tracked in core hardening** |
| F-15 | P2 | Typo/DX | `mistageTags` naming inconsistency | Low | Low | **Closed** |
| F-16 | P2 | Docs | Plan/addenda drift needed stronger source-of-truth links | Medium | Low | **Closed** |
| F-17 | P3 | Performance | No urgent issue, but stale output/dup surface can tax builds | Low | Medium | **Deferred (non-blocking)** |

## What This Audit Still Contributes

- Historical rationale for verification-first architecture.
- Original risk framing for money math and settlement correctness.
- Traceability from prior findings to current tracker closures.

For implementation status, always prefer:
`docs/active/PROJECT_COMPLETION_TRACKER.md`
