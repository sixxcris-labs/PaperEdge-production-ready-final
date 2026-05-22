# PaperEdge

PaperEdge is a verification-first paper-trading workspace for sports betting opportunities. It is designed to help you paste or import opportunities from OddsJam-style sources, verify the market manually on the relevant books, promote only verified candidates into locked paper trades, settle them after the event, and review bankroll movement, P/L, mistakes, and book performance.

PaperEdge is **not** a betting bot. It does not place bets, log into sportsbooks, scrape account balances, bypass geo/KYC, or auto-click sportsbook actions. It is a coach, tracker, and calculator for paper-trading workflows.

## Current architecture

```text
paperedge/
├─ app/                         # Root redirect entrypoint
├─ apps/
│  ├─ dashboard/                # Active app: P&L, locked trades, settlement, mistakes, books, settings
│  └─ verifier/                 # Disabled in current runtime scope (retained as inactive code)
├─ components/                  # Shared UI components
├─ lib/                         # App-specific services and server helpers
├─ packages/
│  ├─ core/                     # Calculators, status helpers, metrics, parser, verification analytics
│  └─ database/                 # Prisma schema, generated client, SQLite adapter, seed data
└─ extensions/paperedge-verifier/ # Chrome verifier extension
```

The important data split is:

- `TradeOpportunity`: source of truth for imported candidates and the verification queue.
- `PaperTrade`: source of truth only after an opportunity passes the lock checklist.

The main workflow is:

```text
Bulk paste → Parse opportunity → Verification queue → Manual book check
→ Recalculate if odds/lines/stakes moved → Pass/fail candidate
→ Lock paper trade → Settle after event → Review P/L and mistakes
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Native build tooling for `better-sqlite3` if a prebuilt binary is unavailable on your platform

## Install

```bash
npm install
```

The repository includes npm workspaces. Install from the repository root, not from individual apps.

## Environment variables

Create `.env.local` when you need local overrides. The app works with defaults for local SQLite development.

```bash
cp .env.example .env.local
```

Common variables:

| Variable                    |                           Default | Purpose                                                         |
|-----------------------------|----------------------------------:|-----------------------------------------------------------------|
| `PAPEREDGE_DATABASE_PATH`   | `packages/database/prisma/dev.db` | Optional absolute or relative path to the SQLite database file. |
| `NEXT_PUBLIC_DASHBOARD_URL` |           `http://localhost:3000` | Root redirect target for dashboard runtime.                     |
| `NEXT_TELEMETRY_DISABLED`   |                             unset | Set to `1` to disable Next telemetry in CI.                     |

## Database

Seed local data:

```bash
npm run db:seed
```

The Prisma schema lives in `packages/database/prisma/schema.prisma`. The generated Prisma client is committed under `packages/database/src/generated/prisma` for this local-first project.

## Run locally

Start the dashboard on port 3000:

```bash
npm run dev:dashboard
```

The root command also loads dashboard:

```bash
npm run dev
```

## Build, typecheck, and test

```bash
npm run typecheck
npm test
npm run build
npm run build:dashboard
```

`npm run validate` runs typecheck, tests, and the active dashboard build path.

## Chrome verifier extension

The extension is located at:

```text
extensions/paperedge-verifier/
```

Install it in Chrome developer mode with **Load unpacked**. The verifier app is disabled in this phase, so extension flows are inactive unless verifier runtime is explicitly re-enabled by a future ADR.

## Safety boundaries

PaperEdge intentionally does not:

- place real wagers
- log into books
- scrape private sportsbook data
- auto-click or fill sportsbook controls
- bypass geolocation, KYC, or account rules
- guarantee profit or advise real-money gambling decisions

Manual verification is mandatory before a `TradeOpportunity` can become a locked `PaperTrade`.

## Production notes

This package is production-ready for a local-first, single-user paper-trading workflow. Before hosting it for multiple users, add real authentication, authorization, hosted database backups, secrets management, rate limiting, and end-to-end browser tests.
