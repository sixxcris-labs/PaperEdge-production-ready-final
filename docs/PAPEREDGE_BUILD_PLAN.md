# PaperEdge Build Plan

> Drop this file into the repo root or `/docs/`. Claude Code and human contributors should read this before touching any feature work.

---

## Product Direction

PaperEdge is **not** a paper trading dashboard. It is a **verification-first trade cockpit** for sports betting paper trading and execution review.

The app's job is to help the user make one clean decision fast, log it, and later show whether they executed it correctly. Everything else is supporting cast.

The story the product tells, in one paragraph:

> Paste or enter a trade. PaperEdge tells you whether it is clean. If clean, log it. After settlement, PaperEdge tells you whether you executed well. Over time, you stop repeating mistakes.

The app does not place bets, connect to sportsbook accounts, automate wagering, scrape balances, bypass geolocation, bypass KYC, or imply guaranteed profit. Education, tracking, and manual decision support only.

---

## The Three Upgrades (the whole product)

1. **Trade Cockpit** — single-screen trade entry with live calculation and a 10-gate verification engine that disables Log Trade until every gate is green.
2. **Settlement Mirror** — after a trade settles, the app shows intent vs reality in plain language, computes the leak, and writes the mistake log automatically.
3. **Edge Pulse** — one number, one diagnostic sentence, one tap deeper. Replaces the dashboard entirely.

---

## Phase 0 — Foundation (1-2 days)

Before any feature work, complete these three tasks in order.

### 0.1 Read what's already in the repo

- `AGENTS.md` and `CLAUDE.md` — existing conventions for contributors and Claude Code. New code follows these.
- `extensions/paperedge-verifier/` — inspect carefully. If this directory contains working verification logic, the Trade Cockpit builds on top of it. If it's a stub, replace it. Either way, read it first.
- `prisma/schema.prisma` — current data model.
- `components/` — existing shadcn/ui primitives. Reuse the primitives, replace the layouts.

### 0.2 Lock the data model

Three core entities. Migrate once, do not reshape mid-build.

**Trade** captures intent at log time:
- `id`, `createdAt`, `updatedAt`
- `goal` — enum: `paper`, `arb`, `promo_conversion`, `cash_bonus_low_hold`, `rollover_clearing`, `bonus_qualification`
- `bookAId`, `bookBId` — foreign keys to `Book`
- `bookARole`, `bookBRole` — enum: `win_into`, `lose_out_of`, `bonus`, `liquid`, `unknown`
- `event`, `market`, `line`, `period` — strings
- `sideA`, `sideB` — strings
- `oddsA`, `oddsB` — integers, American odds
- `stakeA`, `stakeB` — decimals
- `bonusType` — enum: `none`, `cash`, `promo_free_play`, `casino_credit`, `sweeps_cash`
- `rolloverAmount`, `rolloverMultiple` — nullable
- `calculatorUsed` — enum: `arb`, `promo_converter`, `low_hold`
- `expectedProfit`, `expectedLoss` — decimals
- `expectedBalanceMovementA`, `expectedBalanceMovementB` — decimals
- `oddsVerifiedAt` — timestamp of last live-odds re-confirm
- `loggedAt` — timestamp the trade was logged
- `timeBetweenLegsSeconds` — integer, derived
- `verificationGates` — JSON of `{gate_name: pass|fail|unknown}`
- `status` — enum: `logged`, `settled`, `voided`

**TradeSettlement** captures truth at settle time (1:1 with Trade):
- `tradeId`
- `settledAt`
- `actualResult` — enum: `won_a`, `won_b`, `push`, `void`
- `actualProfit`, `actualLoss` — decimals
- `actualBalanceMovementA`, `actualBalanceMovementB` — decimals
- `bonusEarned` — decimal, nullable
- `rolloverReduced`, `rolloverRemaining` — decimals, nullable
- `closingOddsA`, `closingOddsB` — integers, nullable (user-entered, optional)
- `leakAmount` — decimal, derived (`expected - actual`)
- `leakCause` — enum: `stale_odds`, `mismatched_market`, `wrong_calculator`, `late_hedge`, `rollover_drag`, `book_behavior`, `none`
- `cleanToRepeat` — boolean
- `fixNotes` — string

**Book** captures the bankroll map:
- `id`, `name`
- `role` — enum: `win_into`, `lose_out_of`, `bonus`, `liquid`, `unknown`
- `balance` — decimal
- `rolloverRemaining` — decimal, nullable
- `bonusType` — enum (same as Trade)
- `bonusAmount` — decimal, nullable
- `notes` — string

### 0.3 Delete the old surface area

Open a branch `cuts/dashboard-first`. Delete (do not comment out):

- Dashboard-first home route
- Standalone calculator page
- Journal-first workflow
- Trade-count hero cards
- Any "AI suggestions" or "pattern detector" code

Phase 1 is harder to do well if the old surface area is still there pulling attention.

---

## Phase 1 — Trade Cockpit (1-2 weeks)

This is the product. Make `/` route to the Cockpit.

### Desktop layout (1280×800, no scroll target)

Two-column layout.

**Left column (~60%)**, top to bottom:
- Goal (segmented control, single row)
- Books + roles (two side-by-side cards, each with name + role selector)
- Event / Market / Line / Period (one row, four inputs)
- Sides + Odds + Stakes (two rows, one per leg)
- Bonus type + Rollover (one row)

**Right column (~40%)**, top to bottom:
- Recommended hedge stake (large, hero number)
- Expected P&L, best case, worst case (three lines)
- Rollover impact, balance movement (two lines)
- The 10 verification gates stacked with status icons
- Log Trade button pinned at the bottom (disabled until all gates green)

### The 10 verification gates

Each gate is a pure function: `(trade) => { status: 'pass' | 'fail' | 'unknown', message: string }`. They run on every keystroke. Log Trade is enabled only when all 10 return `pass`.

1. **Same event** — `event` string identical between legs (after trim/lowercase).
2. **Same market** — `market` string identical.
3. **Same period** — `period` string identical (full game, first half, etc.).
4. **Same line** — for spread/total markets, `line` value is identical and opposite-signed.
5. **Opposite sides** — `sideA` and `sideB` are confirmed opposite outcomes (use a structured side picker, not free text, to avoid ambiguity).
6. **Odds verified live** — `oddsVerifiedAt` is within last 30 seconds. Stale → show a "Re-verify" button that updates the timestamp.
7. **Correct calculator** — `calculatorUsed` matches the rules in §Calculator selection logic below.
8. **Stake within bankroll** — `stakeA + stakeB` is ≤ configured bankroll percentage (default 5%, user-editable in settings).
9. **Rollover understood** — either `rolloverAmount` and `rolloverMultiple` are both set, OR the user has explicitly checked "rollover unknown / N/A".
10. **Trackable** — all required Trade fields are present and non-empty.

Failing gates render inline next to the offending field in red, with a one-sentence fix instruction. No modals. No popups. No "click here to learn more."

### Calculator selection logic

Not a dropdown. Derived from `goal` + `bonusType`:

| Goal | Bonus type | Required calculator |
|---|---|---|
| `arb` | `none` | `arb` |
| `promo_conversion` | `promo_free_play` | `promo_converter` |
| `cash_bonus_low_hold` | `cash` | `low_hold` (or `arb` if user picks zero-loss target) |
| `rollover_clearing` | any | `low_hold` |
| `bonus_qualification` | any | `arb` |
| `paper` | any | user choice, no enforcement |

If `calculatorUsed` doesn't match, gate 7 fails until either the calculator or the goal/bonus type changes.

### Real-time calculations

The right panel recalculates on every change to inputs. No "Calculate" button. Calculations are pure functions in `lib/calculators/` — easy to unit test, easy to swap.

### Definition of done for Phase 1

A user can complete a full trade entry, pass all 10 gates, and log a trade in under 30 seconds on desktop.

---

## Phase 2 — Settlement Mirror (1 week)

For each logged Trade, add a settlement view at `/trades/[id]/settle`.

### Inputs the user provides

- Actual result (`won_a` / `won_b` / `push` / `void`)
- Actual profit/loss (or auto-compute from odds + stake + result and let user confirm)
- Optional: closing odds on both books

### Everything else is computed

- `leakAmount = expectedProfit - actualProfit`
- `timeBetweenLegsSeconds` — already stored on Trade, surface it
- `leakCause` — inferred:
  - If closing odds differ adversely from logged odds → `stale_odds`
  - If `timeBetweenLegsSeconds > 60` → `late_hedge`
  - If retroactive calculator/bonus mismatch → `wrong_calculator`
  - If actual rollover reduction < expected → `rollover_drag`
  - If the book paid out differently than the calculator predicted → `book_behavior`
  - Else → `none`
- `cleanToRepeat` — `true` if `leakAmount < 5% of expectedProfit` AND no critical gates were skipped at log time

### Output format

Plain language. The exact format:

```
You intended:
  [goal] on [bookA] / [bookB]
  Expected profit: $[expectedProfit]

What happened:
  Actual result: +$[actualProfit] / -$[actualLoss]
  Leak: -$[leakAmount]

Why:
  [one-line leakCause explanation]
  [supporting detail, e.g. "You waited 87 seconds between legs"]

Repeatability:
  Clean enough to repeat: [yes/no]
  Fix before repeating: [one-line fix]
```

For bonus/rollover trades, also show:
- Expected vs actual balance movement
- Bonus earned
- Rollover reduced / remaining
- Did the book behave as expected?
- Did this move money into the right book?

### Auto-populate the Mistake Log

Any settlement where `leakAmount > 0` OR `cleanToRepeat = false` writes a row to the Mistake Log. No separate "add a mistake" workflow exists. Mistakes write themselves.

### Definition of done for Phase 2

Settling a trade produces a useful diagnosis without the user typing anything beyond actual result and (optionally) closing odds.

---

## Phase 3 — Edge Pulse (3-5 days)

Phase 3 is fast because the data is already there.

### Layout

Swipe-away (or left-arrow keyboard shortcut) from Cockpit. One hero number, full-bleed:

```
Verified Edge This Week: +$X
```

Below it, four lines:

```
Expected: +$Y
Actual:   +$X
Leak:     -$Z
Main cause: [most common leakCause across non-zero-leak trades in window]
```

One tap deeper (`/edge/detail`) opens:
- Profit by trade type
- Profit by book
- Expected vs actual scatter
- Mistakes avoided count (trades blocked by gates that would have lost)
- Rollover still locked
- Unsettled exposure

### Aggregation logic

Default window: last 7 days. User-configurable: 24h / 7d / 30d / all.

- `expected = SUM(Trade.expectedProfit) for settled trades in window`
- `actual = SUM(TradeSettlement.actualProfit) for same trades`
- `leak = expected - actual`
- `mainCause = MODE(leakCause) where leakAmount > 0`

### Definition of done for Phase 3

Opening the app shows the user whether they're winning before they take any other action.

---

## Phase 4 — Support views (3-5 days)

These exist but aren't features the user lands on. They're tools the user navigates to.

### `/books` — Book Map

Read/write list of Books with role, balance, rollover, bonus state. Editable inline. This is the "first step" from the OddsFlex Process — but the user goes here when they need to, not on app open.

### `/mistakes` — Mistake Log

Read-only view of auto-populated entries from Settlement Mirror. Sort by date or by frequency of leak cause. No manual entry.

### `/import` — OddsJam import

Accept CSV or paste, normalize into the Trade schema, route to Cockpit pre-filled for verification. The user still verifies before logging.

### `/queue` — Verification queue

List of Trades currently being entered but not yet logged (gates not all green). Useful if the user starts a trade, gets interrupted, comes back.

---

## Testing

Vitest is already set up. Write tests for the parts where wrong output costs the user money:

- `lib/verification/` — each of the 10 gates, each pass/fail boundary
- `lib/calculators/` — every calculator's math against known correct outputs
- `lib/settlement/` — `leakCause` inference logic
- `lib/edge-pulse/` — aggregation logic

Skip UI tests for now. The screens are simple enough that manual QA on the Cockpit is faster than writing them.

---

## Cut list (do not build)

To make sure these don't sneak back in:

- Dashboard-first home
- Separate calculator page
- Journal-first workflow
- Trade count hero cards
- Pattern detector with confidence intervals
- AI suggestions / AI-ranked picks
- Auto-place bets / sportsbook API integration
- Leaderboard / social features
- Badges / streaks / gamification
- Mobile responsive layout (postponed — desktop-first for now)

If a feature would shrug-test (user wouldn't be upset if you deleted it), don't build it.

---

## Timeline

| Phase | Duration | Cumulative |
|---|---|---|
| Phase 0 — Foundation | 1-2 days | 2 days |
| Phase 1 — Trade Cockpit | 1-2 weeks | 2.5 weeks |
| Phase 2 — Settlement Mirror | 1 week | 3.5 weeks |
| Phase 3 — Edge Pulse | 3-5 days | 4 weeks |
| Phase 4 — Support views | 3-5 days | 4.5-5 weeks |

**Total: 5-6 weeks of focused work for a single developer.** Less with Claude Code scaffolding from `CLAUDE.md`.

---

## How to use this file

- **Human contributors:** read top-to-bottom before opening a PR.
- **Claude Code:** treat this as the source of truth for the current direction. If a feature request conflicts with this file, surface the conflict and ask the user to choose. Do not silently expand scope.
- **Updates:** when a phase ships, update the phase section with "✅ Shipped [date]" and any deviations from the plan. Don't rewrite history.
