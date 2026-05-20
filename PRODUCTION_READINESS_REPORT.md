# PaperEdge Production Readiness Report

## Executive summary

This package hardens the uploaded PaperEdge repository as a local-first, single-user paper-trading application. The uploaded audit Markdown described a later monorepo split with `apps/dashboard`, `apps/verifier`, `packages/core`, and `packages/database`, but those folders were not present in the uploaded ZIP. I therefore treated the ZIP contents as the implementation source of truth and documented the monorepo split as optional future work in `optional-new-improvements/`.

The main production-readiness work completed in this pass focused on correctness, data trustworthiness, ownership checks, validation, settlement idempotency, extension hardening, and documentation. Dashboard and P/L charts now use database-backed analytics instead of hard-coded placeholder values. Settlement now updates bankroll and writes bankroll snapshots through one helper. API and server-action inputs were tightened with validation and local-user ownership checks. The Chrome extension API base is configurable, and verifier API CORS is no longer a wildcard.

The project is improved for local single-user operation. It is not ready for hosted multi-user production until authentication, persistent database hosting/backups, dependency audit, and route/API integration tests are added.

## Source and scope reviewed

Reviewed and modified the actual repository in the uploaded ZIP:

```text
Papertrading-main/
  paperedge/
    app/
    components/
    lib/
    prisma/
    extensions/paperedge-verifier/
```

The uploaded audit Markdown was used as guidance, but it did not match the actual ZIP structure. The single-app implementation was preserved rather than fabricating absent workspace folders.

## Files changed

```text
paperedge/.env.example
paperedge/README.md
paperedge/app/api/deep-link/route.ts
paperedge/app/api/export/route.ts
paperedge/app/api/trades/[id]/start-verification/route.ts
paperedge/app/api/trades/[id]/verify-leg/route.ts
paperedge/app/api/trades/active-verification/route.ts
paperedge/app/api/trades/import/route.ts
paperedge/app/books/[id]/deep-links/actions.ts
paperedge/app/books/[id]/deep-links/page.tsx
paperedge/app/books/actions.ts
paperedge/app/books/manage/page.tsx
paperedge/app/books/page.tsx
paperedge/app/globals.css
paperedge/app/layout.tsx
paperedge/app/mistakes/page.tsx
paperedge/app/page.tsx
paperedge/app/pnl/page.tsx
paperedge/app/settings/actions.ts
paperedge/app/settings/page.tsx
paperedge/app/settlement/page.tsx
paperedge/app/trades/[id]/page.tsx
paperedge/app/trades/[id]/settle-actions.ts
paperedge/app/trades/[id]/settle/page.tsx
paperedge/app/trades/[id]/verify/VerifyClient.tsx
paperedge/app/trades/[id]/verify/page.tsx
paperedge/app/trades/actions.ts
paperedge/app/trades/new/TradeForm.tsx
paperedge/app/trades/new/manual-actions.ts
paperedge/app/trades/new/manual-schema.ts
paperedge/app/trades/new/page.tsx
paperedge/app/trades/page.tsx
paperedge/components/ui/design.tsx
paperedge/extensions/paperedge-verifier/EXTENSION_INSTALL.md
paperedge/extensions/paperedge-verifier/background.js
paperedge/extensions/paperedge-verifier/content.js
paperedge/extensions/paperedge-verifier/manifest.json
paperedge/extensions/paperedge-verifier/popup.html
paperedge/extensions/paperedge-verifier/popup.js
paperedge/lib/analytics.test.ts
paperedge/lib/analytics.ts
paperedge/lib/bankroll.test.ts
paperedge/lib/bankroll.ts
paperedge/lib/book-form.test.ts
paperedge/lib/book-form.ts
paperedge/lib/config.ts
paperedge/lib/cors.test.ts
paperedge/lib/cors.ts
paperedge/lib/current-user.ts
paperedge/lib/date-range.test.ts
paperedge/lib/date-range.ts
paperedge/lib/db.ts
paperedge/lib/manual-schema.test.ts
paperedge/lib/status.test.ts
paperedge/lib/status.ts
paperedge/package-lock.json
paperedge/package.json
paperedge/prisma.config.ts
PRODUCTION_READINESS_REPORT.md
optional-new-improvements/INTEGRATION_GUIDE.md
optional-new-improvements/MONOREPO_SPLIT_PLAN.md
optional-new-improvements/SECURITY_HARDENING_BACKLOG.md
```

## Features completed

### Database-backed analytics

- Added `lib/status.ts` with canonical status group helpers.
- Added `lib/analytics.ts` for dashboard metrics, P/L aggregation, bankroll series, and daily expected-vs-actual series.
- Replaced hard-coded dashboard series with analytics derived from stored trades/results.
- Replaced the P&L page's hard-coded monthly profit series with database-backed monthly aggregation.
- Added real date-range filtering for Dashboard, P&L, and Books pages.
- Added data-quality warnings to the dashboard for missing numeric P/L, missing open-trade legs, and unknown book roles.

### Settlement and bankroll correctness

- Added `lib/bankroll.ts` so settlement applies bankroll deltas and writes `BankrollSnapshot` rows in one place.
- Updated manual settlement and imported settlement flows to avoid double-counting settled trades.
- Revalidated dashboard, P&L, trades, and settlement routes after settlement.
- Standardized the default starting bankroll at `1000` through `lib/config.ts` and `lib/current-user.ts`.

### Local-user centralization

- Added `lib/config.ts` and `lib/current-user.ts`.
- Removed repeated local-user lookups from pages/actions and replaced them with a central helper.
- Centralized the future replacement point for real authentication.

### Extension hardening

- Made the Chrome extension API base configurable from the toolbar popup.
- Added support for local alternate verifier ports such as `localhost:3001` and `127.0.0.1:3001`.
- Removed hard-coded save-failure messaging that assumed only `localhost:3000`.
- Added extension documentation and a manual QA checklist.

### Documentation and operations

- Rewrote the truncated `README.md` with setup, environment, commands, extension setup, safety boundaries, and production limitations.
- Added `.env.example`.
- Added explicit Node/npm engines to `package.json`.
- Added `db:generate`, `db:migrate`, and `validate` scripts.
- Added this production-readiness report.
- Added optional future-work plans in `optional-new-improvements/`.

## Bugs fixed

- Removed misleading hard-coded dashboard bankroll and expected-vs-actual series.
- Removed misleading hard-coded P&L monthly chart data.
- Fixed inconsistent bankroll defaults by standardizing on `1000`.
- Fixed settlement bankroll updates so snapshots are written.
- Fixed settlement double-count risk by blocking re-settlement of already settled trades.
- Fixed verify-leg API behavior to validate payloads and confirm the leg belongs to the trade.
- Fixed start-verification API behavior to confirm the trade belongs to the local user.
- Fixed active-verification API behavior to clear stale active trade pointers.
- Fixed mark-not-placed UI behavior so the current override state is saved, not stale React state.
- Fixed book deletion behavior so books tied to trade legs are disabled instead of hard-deleted.
- Fixed blank max bet limits being interpreted as zero instead of unknown/null.
- Fixed charts/sparklines so empty data does not produce invalid min/max calculations.
- Updated app metadata from OddsFlex to PaperEdge.
- Removed debug `console.*` calls from the manual trade form.

## Security issues found and fixed

- Replaced duplicated local-user lookups with one central helper.
- Added ownership checks to trade detail, verification, settlement, book, deep-link, export, and verifier API paths touched during this pass.
- Added Zod validation to import, verify-leg, deep-link, settings, book, manual-trade, settlement, and status-update flows touched during this pass.
- Escaped CSV export cells to reduce malformed CSV/spreadsheet injection risk from commas, quotes, and newlines.
- Replaced wildcard verifier API CORS with an allowlist for localhost, 127.0.0.1, and Chrome extension origins.
- Added request-size limits for import text and notes fields touched during this pass.
- Prevented deleting books that are already referenced by trade legs.
- Validated deep-link URLs before saving.
- Validated extension message handling and made invalid URL parsing fail closed.

## Code quality improvements

- Added pure, unit-testable helpers for status classification, analytics, date ranges, CORS origin checks, and bankroll updates.
- Removed local status-set duplication from dashboard-style calculations.
- Improved type safety with generic analytics metric outputs.
- Moved constants into `lib/config.ts`.
- Reduced UI dependence on fake/synthetic chart data.
- Added reusable date-range helpers and tests.
- Documented the single-user MVP boundary clearly.

## Tests added or updated

Added or updated Vitest coverage for:

- Canonical status grouping and dashboard visibility.
- Dashboard metric calculations.
- Monthly P/L, daily expected-vs-actual, and bankroll series generation.
- Bankroll delta/snapshot helper behavior.
- Book form validation, including blank max-bet handling.
- CORS origin allowlist behavior.
- Date-range parsing and filtering.
- Manual trade schema validation.

Test files added/updated:

```text
paperedge/lib/analytics.test.ts
paperedge/lib/bankroll.test.ts
paperedge/lib/book-form.test.ts
paperedge/lib/cors.test.ts
paperedge/lib/date-range.test.ts
paperedge/lib/manual-schema.test.ts
paperedge/lib/status.test.ts
```

## Validation performed

Performed in this environment:

```bash
node --check extensions/paperedge-verifier/background.js
node --check extensions/paperedge-verifier/popup.js
node --check extensions/paperedge-verifier/content.js
npm ci --dry-run --ignore-scripts --no-audit --no-fund --loglevel=error
```

Results:

- Extension JavaScript syntax checks passed.
- Dependency dry-run succeeded.

## Verification not completed in this environment

Full dependency installation, `npm run test`, `npm run build`, and `npm run validate` were not completed here because the execution environment provides:

```text
Node.js v18.20.4
npm 9.2.0
```

The checked-in dependency graph requires Node.js >= 20.19.0 and npm >= 10. The dry-run surfaced engine incompatibilities for current dependencies such as Prisma, Vite/Vitest, Tailwind, better-sqlite3, and Next.js when run under Node 18.

Run this sequence on Node >= 20.19.0 before shipping:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run test
npm run build
npm run validate
npm audit
```

## Remaining risks and limitations

- No real authentication or session management exists yet.
- The app is still a local single-user MVP.
- SQLite is configured for local-first use; hosted deployment needs persistent storage and backups.
- Browser/server actions need CSRF/session hardening before multi-user hosting.
- End-to-end tests are still missing.
- API route integration tests are still missing.
- The Chrome extension remains a manual verification assist only and must not be expanded into scraping or automation.
- The later monorepo split described by the uploaded audit is not implemented because the ZIP did not contain that workspace structure.
- Dependency vulnerability review still needs `npm audit` in a supported Node environment.

## Assumptions made

- The uploaded ZIP is the implementation source of truth.
- The uploaded audit Markdown is guidance, not a literal representation of the actual ZIP.
- PaperEdge remains a local, single-user, paper-trading-only application for this pass.
- No sportsbook credentials, external APIs, real-money wagering, scraping, or automation should be added.
- Preserving existing functionality is more important than performing a disruptive architecture rewrite.

## Setup instructions

```bash
cd paperedge
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

```text
http://localhost:3000
```

## Build, test, and deploy instructions

### Build and test locally

```bash
npm run db:generate
npm run test
npm run build
```

### Full local validation

```bash
npm run validate
npm audit
```

### Run production build locally

```bash
npm run build
npm run start
```

### Deployment notes

For local use, SQLite at `prisma/dev.db` is acceptable. For hosted or multi-user production, add:

1. Authentication.
2. User/session authorization checks across every route.
3. Persistent database hosting or a persistent SQLite volume.
4. Backup and restore procedures.
5. Secrets management.
6. CI for tests, builds, dependency audit, and secret scanning.
7. Extension origin configuration for a known extension ID.

## Recommended next steps

1. Run the validation sequence on Node >= 20.19.0.
2. Fix any TypeScript/build issues found by that supported environment.
3. Add API integration tests for import, verify-leg, active-verification, start-verification, deep-link, export, and settlement.
4. Add Playwright smoke tests for add -> verify -> lock -> settle -> export.
5. Decide whether PaperEdge remains local-only or becomes hosted/multi-user.
6. If hosted/multi-user, implement the security backlog in `optional-new-improvements/SECURITY_HARDENING_BACKLOG.md`.
7. Only after the single app validates cleanly, consider the optional monorepo split in `optional-new-improvements/MONOREPO_SPLIT_PLAN.md`.
