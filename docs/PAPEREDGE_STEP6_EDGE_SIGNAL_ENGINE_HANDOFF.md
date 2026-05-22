# PaperEdge Step 6: Normalized edge signal engine

## Goal

Add a pure signal engine that compares `NormalizedMarket[]` groups and emits research signals for manual PaperEdge review.

This is not a trade executor. It should produce candidate signals such as:

- Same-line opposite-side comparison
- Player prop line-split middle
- Exchange stale liquidity watch
- Soft-book lag watch
- Market mismatch rejection

## Depends on

Complete these first:

```txt
Step 1: Core normalized market model
Step 2: Novig adapter
Step 3: ProphetX adapter
Step 4: Bovada adapter
Step 5: Kalshi adapter
```

## Repo placement

Add these files:

```txt
packages/core/src/edge-signal-engine.ts
packages/core/src/edge-signal-engine.test.ts
```

Update:

```txt
packages/core/src/index.ts
packages/core/package.json
```

Do not add UI, DB writes, API routes, or live feed polling in this step.

## Safety boundary

This engine must not:

- Place bets
- Submit orders
- Generate auto-execution instructions
- Claim profitability
- Treat displayed odds as accepted stake
- Treat trade tape as executable liquidity

It only labels candidate signals for manual verification and paper-trading review.

## Required exports

Create these types:

```ts
import type { NormalizedMarket } from "./market-normalization";

export type EdgeSignalType =
  | "same_line_opposite_side"
  | "line_split_middle"
  | "exchange_stale_liquidity_watch"
  | "soft_book_lag_watch"
  | "market_mismatch_reject"
  | "insufficient_data_watch";

export type EdgeSignalSeverity = "info" | "watch" | "candidate" | "reject";

export type EdgeSignal = {
  id: string;
  type: EdgeSignalType;
  severity: EdgeSignalSeverity;
  markets: NormalizedMarket[];
  reason: string;
  verificationNotes: string[];
  createdAt: string;
};

export type EdgeSignalEngineOptions = {
  maxFreshnessSeconds?: number;
  requireLiquidityForExchangeSignals?: boolean;
  createdAt?: string;
};

export function detectEdgeSignals(
  markets: NormalizedMarket[],
  options?: EdgeSignalEngineOptions,
): EdgeSignal[];
```

## Detection rules

### 1. Same-line opposite-side

Emit `same_line_opposite_side` only when:

```txt
same loose comparison key
same line
opposite sides
both odds available
freshness passes if timestamps are available
```

Severity:

```txt
candidate
```

Verification notes must include:

```txt
Verify same event.
Verify same market.
Verify same period.
Verify live odds.
Verify accepted stake or visible limit.
Verify settlement source.
Use standard arb calculator before paper lock.
```

### 2. Line-split middle

Emit `line_split_middle` only when:

```txt
same loose comparison key
opposite sides
over.line < under.line
both odds available
```

Severity:

```txt
candidate
```

Verification notes must include:

```txt
Classify as middle, not standard arb.
Use middle calculator.
Check push and middle corridor.
Verify settlement source and OT treatment.
```

### 3. Exchange stale liquidity watch

Emit `exchange_stale_liquidity_watch` when:

```txt
one market source is novig, prophetx, or kalshi
one comparison source is a sportsbook such as bovada
exchange side has liquidity > 0
same loose comparison key
opposite or comparable side relationship exists
```

Severity:

```txt
watch
```

Do not promote to candidate until fees, freshness, settlement, and manual stake/fill assumptions are verified.

### 4. Soft-book lag watch

Emit `soft_book_lag_watch` when:

```txt
bovada or another soft/offshore source differs from exchange/reference source
same loose comparison key
odds or line discrepancy exists
```

Severity:

```txt
watch
```

### 5. Market mismatch rejection

Emit `market_mismatch_reject` when markets appear close but fail key checks:

```txt
different player
different period
different market type
same-side false hedge
bad line relationship such as Over 32.5 vs Under 27.5
```

Severity:

```txt
reject
```

## Freshness rules

Default freshness threshold:

```txt
30 seconds
```

If timestamps are missing, do not reject automatically. Emit `insufficient_data_watch` with a verification note.

## Tests to add

Create `packages/core/src/edge-signal-engine.test.ts` with tests for:

1. Same-line opposite-side creates a candidate signal.
2. Over 27.5 vs Under 28.5 creates a line-split middle signal.
3. Over 32.5 vs Under 27.5 creates a rejection or no candidate.
4. Same-side markets do not create a candidate.
5. Different player creates a rejection.
6. Different period creates a rejection.
7. Exchange market with liquidity creates watch signal.
8. Exchange market with no liquidity does not become candidate.
9. Bovada displayed odds do not become liquidity.
10. Missing timestamps create watch note, not a false pass.

## Export changes

In `packages/core/src/index.ts`, add:

```ts
export * from "./edge-signal-engine";
```

In `packages/core/package.json`, add:

```json
"./edge-signal-engine": "./src/edge-signal-engine.ts"
```

Do not remove existing exports.

## Commands

Run from repo root in PowerShell:

```powershell
npx vitest run packages/core/src/edge-signal-engine.test.ts
npm run test
```

## Acceptance criteria

This step is done when:

- `detectEdgeSignals` emits only research signals.
- Same-line, middle, watch, and reject classifications are tested.
- Verification notes force manual PaperEdge gates before any paper lock.
- No database, UI, API, or execution behavior is added.
