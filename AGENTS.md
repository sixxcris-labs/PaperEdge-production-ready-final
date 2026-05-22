# PaperEdge Agent Instructions

Use this file as the operating guide for coding agents working on PaperEdge.

<!-- BEGIN:nextjs-agent-rules -->
## Next.js 16 Rule

This is not the Next.js you know. This version has breaking changes; APIs, conventions, and file structure may differ from training data. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 🛑 Platform — Native Windows Only (Hard Rule)

**PaperEdge runs on native Windows. Never use WSL, and never switch platforms.**

The Windows dashboard (Next.js + the `better-sqlite3` native addon) and a
WSL/Linux toolchain share one `node_modules` and **cannot coexist**. Crossing
the boundary has already caused two failures: (1) `better-sqlite3` rebuilt as a
Linux ELF → every DB page threw *"not a valid Win32 application"*; (2) a WSL run
translated the novig `filePath` to `/mnt/c/...` and captured **0 markets**.

**Always**
- Run all Node / npm / tsx / prisma / vitest / next commands from **PowerShell**
  (native Windows). Use Git Bash for `git` only — not for project tooling.
- Use **repo-relative paths** in configs/scripts (`raw_data/novig_marketNBA.json`),
  resolved against the repo root in code. Never commit absolute paths.

**Never**
- `wsl`, `wsl bash`, or any WSL shell for building/running/testing this project.
- `TMPDIR=/tmp`, `/tmp/...`, `/mnt/c/...`, or POSIX absolute paths anywhere.
- Absolute Windows paths (`C:\Users\...`) hard-coded in committed configs.
- `npm install` / `npm rebuild` from WSL.

**Recovery** — if a DB page throws *"not a valid Win32 application"*, the native
addon is built for the wrong OS: run `npm rebuild better-sqlite3` from PowerShell.

Rationale and full recovery steps: `docs/PLATFORM.md`.

## Live Planning Sources

- Completion tracker (update every coding session): `docs/active/PROJECT_COMPLETION_TRACKER.md`
- Architecture route ownership ADR: `docs/active/ADR-002-split-app-route-ownership.md`
- Bookmap product boundary ADR: `docs/active/ADR-003-bookmap-boundary.md`
- Current implementation plan: `docs/PAPEREDGE_BUILD_PLAN.md`
- Canonical verification commands: `docs/QUALITY_GATES.md`
- Prior repository audit: `docs/REPO_AUDIT_AND_NEXT_STEPS.md`

PaperEdge is a paper-trading app for tracking simulated sports-betting opportunities. It does not place real wagers, connect to sportsbook accounts, bypass geo checks, scrape private account data, or guarantee profit. The core product is a manual and semi-assisted workflow that helps the user import opportunities, verify the details, lock paper trades, track outcomes, and review performance.

## Product Mission

Build PaperEdge as a clean verification-first paper-trading system.

The app should help the user answer five questions quickly:

1. Is this opportunity valid enough to enter the verification queue?
2. Do both legs match the same event, player, market, line, and settlement rule?
3. Is the opportunity still available on the listed books before lock-in?
4. What stake split gives clean exposure and profit/loss tracking?
5. After the event settles, did the locked paper trade win, lose, push, void, or expose a mistake?

## Non-Negotiable Safety Rules

- Paper trading only. Never add real-money betting execution.
- Do not build flows that log in to sportsbooks, bypass KYC, bypass location checks, or automate placing wagers.
- Verification may guide the user through manual checks, but the user must confirm sportsbook availability and settlement details.
- Always preserve disclaimers that explain the app is for simulation, tracking, and education.
- Do not present paper-trade outcomes as guaranteed profit.
- If a sportsbook, market, or line cannot be verified, move the trade to `Verification Queue` or `Rejected`, not `Locked`.

## Core Workflow

PaperEdge should use this default lifecycle:

1. `Imported` - Raw pasted opportunity or OddsJam-style text has been parsed.
2. `Verification Queue` - The trade has enough data to review but is not confirmed.
3. `Needs Review` - Missing, mismatched, stale, duplicate, or risky data needs correction.
4. `Locked Paper Trade` - The user verified exact event, market, line, books, sides, odds, and stakes.
5. `Settled` - The result has been entered and profit/loss has been calculated.
6. `Rejected` - The trade is invalid, duplicated, unsafe, unavailable, or not worth tracking.

Do not skip verification. A trade should only become locked when both legs are clean and the user has enough evidence to trust the simulation record.

## Data Model Priorities

Every trade should preserve enough data to audit the decision later.

Required trade fields:

- `tradeId`
- `date`
- `event`
- `startTime`
- `sport`
- `league`
- `market`
- `line`
- `status`
- `totalExposure`
- `expectedProfitRange`
- `notes`

Required leg fields:

- `book`
- `side`
- `odds`
- `stake`
- `line`
- `market`
- `player` when applicable
- `team` when applicable
- `liquidity` when available
- `verificationStatus`

Settlement fields:

- `result`
- `winningLeg`
- `profitLoss`
- `settledAt`
- `settlementNotes`
- `mistakeTags`

## Verification Logic

Before allowing a trade to be locked, check the following:

- Same event and start time.
- Same market type.
- Same player or team, when applicable.
- Same line, including half-points, spreads, totals, alternate lines, and handicap rules.
- Opposite sides that actually hedge each other.
- Odds are present, valid, and parseable.
- Stakes are present, valid, and realistic.
- Expected profit/loss math is shown clearly.
- Duplicate or near-duplicate trades are flagged.
- Settlement rules are noted for markets with push, void, dead heat, overtime, or Asian handicap behavior.

Player props need extra caution. Flag them when there is any mismatch in player name, market label, stat category, line, team, or game.

## Profit Logic

Optimize paper trades around highest realistic profit for the available budget, not just the highest arb percentage.

When multiple clean opportunities exist, prefer splitting budget across several verified trades instead of concentrating everything into one or two trades, as long as each trade passes verification, liquidity, and tracking checks.

Show these calculations:

- Total exposure.
- Profit if Leg A wins.
- Profit if Leg B wins.
- Expected profit range.
- Hedge stake, when applicable.
- Any push, void, or settlement edge cases.

Use simple formulas and keep numbers readable. Avoid hiding math behind vague labels.

## Book Management

The Books page should help the user manage only the sportsbooks they care about for paper trading.

Each book record should support:

- `name`
- `type`, such as `sportsbook`, `exchange`, `sweepstakes`, or `prediction market`
- `status`, such as `Active`, `KYC Pending`, `Watchlist`, or `Disabled`
- `balance`, for paper-tracking only
- `defaultRole`, such as `Win Into`, `Lose Out Of`, `Bonus`, or `Manual Review`
- `links`
- `notes`

Do not assume a book is legal, available, or usable for the user unless the app marks it as user-verified. Keep unsupported or uncertain books behind a review status.

## Import Experience

The import feature should accept messy pasted text from OddsJam-style boards or manual notes and convert it into structured draft trades.

Expected behavior:

- Parse multiple trades from one paste.
- Preserve original raw text for audit.
- Identify books, event, market, participant, line, odds, stake, liquidity, start time, and arb percentage when available.
- Flag missing or uncertain fields instead of inventing values.
- Detect duplicate trades before adding them.
- Send parsed trades to the verification queue, not directly to locked trades.

If parsing fails, return a clear error explaining which required fields were missing.

## Dashboard Requirements

The dashboard should show the user what matters immediately:

- Current paper bankroll or total tracked budget.
- Total exposure in locked trades.
- Open verification queue count.
- Locked trades pending settlement.
- Settled profit/loss.
- Win/loss/push/void counts.
- Mistakes by category.
- Best and worst books by paper performance.
- Recent locked trades and recent settled trades.

The dashboard should separate real metrics from simulated paper results. Use labels that make simulation status impossible to miss.

## Journal Requirements

The journal should be the source of truth for learning.

Each entry should capture:

- Why the trade was considered.
- What was verified.
- What was uncertain.
- Why it was locked, rejected, or skipped.
- Final result.
- Mistakes or lessons learned.

Mistake tags should include examples like:

- `Line Mismatch`
- `Wrong Market`
- `Stale Odds`
- `Book Unavailable`
- `Duplicate Trade`
- `Settlement Rule Missed`
- `Liquidity Too Low`
- `Player Prop Risk`
- `Manual Verification Failed`

## UX Principles

PaperEdge should feel fast, clear, and confidence-building.

- Make the verification queue the center of the app.
- Use strong status labels and obvious next actions.
- Never bury why a trade cannot be locked.
- Keep locked trades visually separate from drafts and rejected trades.
- Make paste-to-queue fast, but lock-in deliberate.
- Use clean cards, tables, and filters for scanability.
- Support mobile layouts without breaking the workflow.

Avoid generic dashboards that look useful but do not help the user decide what to do next.

## Frontend Design Direction

Use a bold trading desk style without making the app look like a casino.

Good direction:

- Calm dark or neutral surfaces.
- High-contrast status badges.
- Compact cards for trades.
- Clear queue lanes.
- A focused command-style import area.
- Tables that are dense but readable.
- Small motion only where it helps status changes feel clear.

Avoid:

- Purple default SaaS styling.
- Overly playful betting visuals.
- Flashy casino colors.
- Huge empty hero sections.
- Generic AI-generated gradients that do not support the workflow.

## Engineering Rules

Work like a senior engineer in an existing codebase.

- Read the current implementation before editing.
- Reuse existing types, utilities, components, and patterns before adding new ones.
- Keep changes type-safe.
- Avoid `any` unless there is a strong reason and it is documented.
- Avoid broad `try/catch` blocks that hide errors.
- Do not silently swallow invalid data.
- Preserve user changes in a dirty worktree.
- Never run destructive git commands unless the user explicitly asks.
- Do not change unrelated files.
- Keep edits coherent and batched.
- Add tests or validation when behavior changes.
- Run available type-check, lint, or build commands when feasible.

## Error Handling

Errors should be visible and useful.

- Invalid paste input should explain which fields are missing.
- Verification failures should list exact mismatches.
- Math errors should identify invalid odds, stake, or line values.
- Duplicate detection should show the matching existing trade.
- Settlement errors should explain what result data is missing.

Do not create success-shaped fallbacks for failed parsing, failed verification, or failed settlement.

## Review Standard

When reviewing PaperEdge code, prioritize:

1. Bugs that could mark an invalid trade as locked.
2. Math errors in odds, hedge stakes, exposure, or profit/loss.
3. Missing validation around imported trade data.
4. Duplicate detection gaps.
5. Unsafe UX that makes paper trades look like real-money guarantees.
6. Type-safety issues.
7. Missing tests for parser, calculator, status transitions, and settlement.

Findings should come before summaries.

## Output Style For Coding Agents

When reporting work back to the user:

- Be concise and direct.
- Start with what changed.
- Reference exact file paths.
- Mention tests or checks that were run.
- If something could not be verified, say so plainly.
- Suggest only the most logical next step.

Do not dump full files into the response unless the user specifically asks.

## Preferred Locked Trade Format

Use this format when displaying locked paper trades:

```text
Trade ID: TODAY-SHAMET-PTS-LOCKED
Date: May 19, 2026
Event: Cleveland Cavaliers vs New York Knicks
Start Time: 7:00 PM
Market: Player Points
Line: Landry Shamet 1.5 Points

Book A: Sportzino
Side A: Landry Shamet Over 1.5 Points
Odds A: -140
Stake A: $153

Book B: Bovada
Side B: Landry Shamet Under 1.5 Points
Odds B: +170
Stake B: $97

Total Exposure: $250
Expected Profit Range: $0.00 to $0.00
Status: Locked Paper Trade
Notes: Verified exact player, market, line, and both sides.
```

## Preferred Verification Queue Format

Use this format when displaying trades that still need review:

```text
Trade ID: PENDING-001
Date: May 19, 2026
Event: Team A vs Team B
Start Time: 7:00 PM
Market: Player Prop
Line: Player Name 1.5 Assists
Status: Verification Queue

Book A: Book Name
Side A: Over 1.5
Odds A: +120
Stake A: $100
Verification A: Needs manual sportsbook check

Book B: Book Name
Side B: Under 1.5
Odds B: -110
Stake B: $110
Verification B: Needs manual sportsbook check

Checks Needed:
- Confirm both books show the same event.
- Confirm both books show the same market and line.
- Confirm both odds are still available.
- Confirm settlement rules.
```

## Current Product Direction

PaperEdge currently runs as a dashboard-only app for this phase.

- `apps/dashboard` is the active runtime surface.
- Verifier runtime code has been removed from this repository.

Keep shared logic portable where possible:

- Odds parsing.
- Trade normalization.
- Duplicate detection.
- Verification checks.
- Profit/loss calculations.
- Settlement helpers.

The dashboard should not depend on risky browser automation. Any future verification-helper reactivation must remain manual and user-confirmed.
