# Money Representation Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate persisted money math from floating-point storage to integer cents for trade, settlement, bankroll, and verifier paths without changing user-visible behavior.

**Architecture:** Add parallel `*Cents` fields first, backfill from existing float columns, dual-write during transition, then switch reads/calculations to cents helpers and finally retire legacy float reads. Keep arithmetic in integer cents inside domain logic and only format to dollars at UI boundaries.

**Tech Stack:** Prisma + SQLite, Next.js 16 app router, TypeScript, Vitest, `@paperedge/core` shared package.

## Scope and rules

- Money-like persisted values migrate to integer cents.
- Percentage/rate fields remain non-cents (for example `maxStakePct`, `expectedRoiPct`, `lowHoldLossPct`, `confidence`).
- Line/spread numeric fields are not money and remain non-cents.
- Transition must be backwards-safe on existing dev DB data.

### Task 1: Add money utility module and tests in `@paperedge/core`

**Files:**
- Create: `packages/core/src/money.ts`
- Create: `packages/core/src/money.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`

**Step 1: Write failing tests for cents conversion semantics**
- Round-half-away-from-zero for decimal-dollar inputs.
- Null/undefined handling helpers.
- Integer cents formatting to dollars string helpers for server-side usage.

Run:
```bash
npm test -- packages/core/src/money.test.ts
```
Expected: failing test file before implementation.

**Step 2: Implement minimal helper set**
- `toCents(amount: number): number`
- `fromCents(cents: number): number`
- `toCentsOrNull(value: number | null | undefined): number | null`
- `fromCentsOrNull(value: number | null | undefined): number | null`
- `sumCents(values: Array<number | null | undefined>): number`

**Step 3: Re-run focused test**
Run:
```bash
npm test -- packages/core/src/money.test.ts
```
Expected: pass.

**Step 4: Export helpers from core package**
- Add exports in `packages/core/src/index.ts`.
- Add subpath export in `packages/core/package.json` if needed.

**Step 5: Verify no regressions**
Run:
```bash
npm run typecheck
npm test
```

### Task 2: Add parallel cents columns to Prisma schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create migration: `packages/database/prisma/migrations/<timestamp>_add_money_cents_columns/migration.sql`

**Step 1: Write schema tests first (if available) or snapshot assertions**
- Add/update schema-structure assertions where migration shape is tested.

**Step 2: Add cents fields (nullable for backfill transition)**
Target models and fields:
- `UserSettings`: `startingBankrollCents`, `currentBankrollCents`
- `Book`: `currentBalanceCents`, `rolloverRemainingCents`, `maxBetLimitCents`
- `PaperTrade`: `expectedProfitIfACents`, `expectedProfitIfBCents`, `worstCasePLCents`, `bestCasePLCents`, `totalStakeExposureCents`, `hedgeStakeCents`, `promoConversionValueCents`, `lowHoldLossAmountCents`
- `TradeOpportunity`: `stakeACents`, `stakeBCents`, `liquidityACents`, `verifiedLiquidityACents`, `liquidityBCents`, `verifiedLiquidityBCents`, `totalExposureCents`, `profitIfAWinsCents`, `profitIfBWinsCents`, `expectedProfitMinCents`, `expectedProfitMaxCents`, `outsideLossCents`, `middleProfitCents`
- `TradeLeg`: `stakeCents`, `maxBetAtBookCents`
- `Result`: `actualPayoutCents`, `actualProfitLossCents`
- `Bonus`: `bonusAmountCents`, `depositAmountCents`, `requiredBettingVolumeCents`, `volumeCompletedCents`, `volumeRemainingCents`
- `BankrollSnapshot`: `currentBankrollCents`, `dailyPLCents`, `weeklyPLCents`, `monthlyPLCents`, `drawdownCents`

**Step 3: Generate migration SQL**
- Use Prisma migration generation.
- Ensure defaults for non-null requirements are not introduced yet; keep nullable until backfill done.

**Step 4: Validate schema client generation**
Run:
```bash
npm run db:generate
npm run typecheck
```

### Task 3: Backfill cents fields from legacy float values

**Files:**
- Create: `packages/database/prisma/backfill-money-cents.ts`
- Modify: root/package scripts to add backfill command

**Step 1: Write failing test for conversion behavior**
- Focused test for representative rows and rounding.

**Step 2: Implement idempotent backfill script**
- For each table, set cents field when null and source float is non-null.
- Conversion uses `Math.round(value * 100)` through shared helper.
- Batch updates in transactions.

**Step 3: Run and verify backfill locally**
Run:
```bash
npm run db:backfill-money-cents
```
Expected: reports per-table updated row counts; repeat run updates 0 rows.

### Task 4: Dual-write in mutation paths

**Files:**
- Modify: `apps/dashboard/app/books/actions.ts`
- Modify: `apps/dashboard/app/settings/actions.ts`
- Modify: `apps/dashboard/app/trades/actions.ts`
- Modify: `apps/dashboard/app/trades/new/manual-actions.ts`
- Modify: `apps/dashboard/app/trades/[id]/settle-actions.ts`
- Modify: `apps/verifier/app/api/trades/[id]/lock/route.ts`
- Modify: `apps/verifier/app/settlement/actions.ts`
- Modify: `lib/lock-opportunity.ts`
- Modify: `lib/opportunity-service.ts`

**Step 1: Add failing tests around written records where test coverage exists**
- Settlement and lock flows should write both float and cents fields consistently.

**Step 2: Implement dual-write**
- Any write to a money float field also writes the corresponding cents field.
- Use helper functions for conversion.

**Step 3: Run targeted and full tests**
Run:
```bash
npm test -- apps/verifier/lib/opportunity-service.test.ts
npm test
npm run typecheck
```

### Task 5: Switch read/calculation paths to cents-first

**Files:**
- Modify: `packages/core/src/trade-metrics.ts`
- Modify: `packages/core/src/dashboard-series.ts`
- Modify: `packages/core/src/bankroll-snapshots.ts`
- Modify: `apps/dashboard/app/page.tsx`
- Modify: `apps/dashboard/app/pnl/page.tsx`
- Modify: `apps/dashboard/app/settlement/page.tsx`
- Modify: `apps/dashboard/app/trades/page.tsx`
- Modify: `apps/verifier/app/page.tsx`
- Modify: `apps/verifier/app/verify/page.tsx`
- Modify: `apps/verifier/app/locked/page.tsx`

**Step 1: Write failing tests for cents-based calculations**
- Add tests proving no floating drift in representative arithmetic.

**Step 2: Implement cents-first read adapters**
- Prefer `*Cents` fields when present.
- Fallback to float-to-cents conversion for old rows during transition.

**Step 3: Keep UI APIs in dollars**
- Convert cents to dollars only at display boundaries.

**Step 4: Verify parity of expected outputs**
Run:
```bash
npm test
npm run typecheck
npm run build:dashboard
npm run build:verifier
```

### Task 6: Tighten validations to cents semantics

**Files:**
- Modify: `apps/dashboard/app/trades/new/manual-schema.ts`
- Modify: `apps/dashboard/app/settings/actions.ts`
- Modify: `apps/dashboard/app/books/actions.ts`
- Modify: verifier request parsers that accept money values

**Step 1: Add failing validation tests**
- Reject NaN, infinities, and absurd magnitudes.
- Normalize string money inputs before cents conversion.

**Step 2: Implement validators and parsing helpers**
- Centralize in one utility module to avoid drift.

**Step 3: Verify**
Run:
```bash
npm test
npm run typecheck
```

### Task 7: Remove legacy float reads and optionally drop legacy fields

**Files:**
- Modify: all read paths still depending on floats
- Optional migration: drop deprecated float columns after confirmed rollout

**Step 1: Search audit**
Run:
```bash
grep -R "expectedProfitIfA\|actualProfitLoss\|currentBankroll\|totalStakeExposure\|stakeA\|stakeB" -n apps packages lib
```

**Step 2: Remove fallback logic only after all rows backfilled**
- Gate with a one-time verification command that checks no null cents for required records.

**Step 3: Optional destructive migration (separate PR)**
- Drop or deprecate float columns after stability window.

### Task 8: Documentation and tracker updates

**Files:**
- Modify: `docs/active/PROJECT_COMPLETION_TRACKER.md`
- Create: `docs/QUALITY_GATES.md`
- Modify: `README.md` money-model notes

**Step 1: Document command sequence and known caveats**
- Include conversion assumptions and rounding mode.

**Step 2: Record evidence**
- Add exact command outputs summary for typecheck/test/build/validate.

## Verification checklist

Run from repo root:

```bash
npm run typecheck
npm test
npm run build
npm run build:dashboard
npm run build:verifier
npm run validate
```

Data sanity checks:

```bash
npm run db:backfill-money-cents
# re-run should report zero updates
npm run db:backfill-money-cents
```

## Risks and mitigation

1. Risk: Mixed cents/float reads create temporary mismatches.
- Mitigation: dual-write + cents-first/fallback read adapters + parity tests.

2. Risk: Rounding differences change historical metrics slightly.
- Mitigation: explicitly document `Math.round(value * 100)` rule and add fixture tests.

3. Risk: Migration touches many files and increases merge conflicts.
- Mitigation: implement in small PR-sized batches by task, with gate checks after each batch.

## Suggested commit slicing

1. `feat(core): add money cents helpers and tests`
2. `feat(db): add cents columns + migration`
3. `feat(db): add idempotent backfill script`
4. `feat(app): dual-write cents in mutation paths`
5. `feat(app): switch reads/calcs to cents-first`
6. `docs: update tracker and quality gates for money migration`

