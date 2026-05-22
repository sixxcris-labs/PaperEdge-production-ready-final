# PaperEdge Step 1: Core normalized market model

## Goal

Add a pure shared core module that converts sportsbook, exchange, and prediction-market observations into one canonical `NormalizedMarket` shape.

This is the foundation for PaperEdge moving from manual hunting to microstructure research infrastructure.

## Repo placement

Add these files:

```txt
packages/core/src/market-normalization.ts
packages/core/src/market-normalization.test.ts
```

Update these files:

```txt
packages/core/src/index.ts
packages/core/package.json
```

Do not add database migrations, UI, API routes, browser extension code, or live feed adapters in this step.

## Safety boundary

This module is pure data normalization and comparison only.

It must not:

- Place wagers
- Submit orders
- Automate sportsbook actions
- Bypass geofence, KYC, login, limits, or book controls
- Store account credentials
- Claim an edge is profitable

All output should be treated as research or paper-trading support only.

## Required canonical type

Create this type in `packages/core/src/market-normalization.ts`:

```ts
export type MarketSource = "novig" | "prophetx" | "bovada" | "kalshi" | "unknown";

export type NormalizedMarketStatus = "open" | "suspended" | "closed" | "upcoming" | "unknown";

export type NormalizedMarket = {
  source: MarketSource;
  sourceMarketId?: string | null;
  sourceOutcomeId?: string | null;
  sourceEventId?: string | null;
  event_id: string;
  event_name: string;
  sport: string;
  league: string;
  market_type: string;
  player?: string | null;
  side: string;
  line?: number | null;
  odds_american?: number | null;
  implied_probability?: number | null;
  liquidity?: number | null;
  timestamp: string;
  status: NormalizedMarketStatus;
  live: boolean;
  period: string;
  raw?: unknown;
};
```

Keep the user's requested shape intact, but add optional source IDs and `raw` for traceability.

## Required helper functions

Implement these functions:

```ts
export function normalizeText(value: unknown): string;
export function normalizeSide(value: unknown): string;
export function normalizePeriod(value: unknown): string;
export function normalizeMarketType(value: unknown): string;
export function americanToImpliedProbability(oddsAmerican: number): number | null;
export function probabilityToAmerican(probability: number): number | null;
export function decimalToAmerican(decimalOdds: number): number | null;
export function marketComparisonKey(market: NormalizedMarket): string;
export function strictMarketComparisonKey(market: NormalizedMarket): string;
export function groupMarketsByComparisonKey(markets: NormalizedMarket[]): Map<string, NormalizedMarket[]>;
export function isOppositeSide(a: NormalizedMarket, b: NormalizedMarket): boolean;
export function hasSameLineRelationship(a: NormalizedMarket, b: NormalizedMarket): boolean;
export function hasMiddleLineRelationship(a: NormalizedMarket, b: NormalizedMarket): boolean;
export function assessMarketRelationship(a: NormalizedMarket, b: NormalizedMarket): MarketRelationshipAssessment;
```

Add this assessment type:

```ts
export type MarketRelationshipKind =
  | "same_line_opposite_side"
  | "middle_line_split"
  | "same_side"
  | "market_mismatch"
  | "period_mismatch"
  | "player_mismatch"
  | "event_mismatch"
  | "unknown";

export type MarketRelationshipAssessment = {
  kind: MarketRelationshipKind;
  comparable: boolean;
  reason: string;
};
```

## Important line relationship implementation

Use this version to avoid the TypeScript nullability bug:

```ts
export function hasMiddleLineRelationship(a: NormalizedMarket, b: NormalizedMarket): boolean {
  if (!isOppositeSide(a, b)) return false;
  if (a.line === null || a.line === undefined || b.line === null || b.line === undefined) return false;

  const over = normalizeSide(a.side) === "over" ? a : b;
  const under = normalizeSide(a.side) === "under" ? a : b;

  if (normalizeSide(over.side) !== "over" || normalizeSide(under.side) !== "under") {
    return false;
  }

  if (over.line === null || over.line === undefined || under.line === null || under.line === undefined) {
    return false;
  }

  return over.line < under.line;
}
```

## Comparison key rules

`marketComparisonKey` should include:

```txt
sport
league
event_name
market_type
player
period
```

Do not include line in the loose comparison key because line-split middles require grouping different lines together.

`strictMarketComparisonKey` should include the loose key plus:

```txt
line
```

Use loose key for middle detection. Use strict key for same-line arb comparison.

## Tests to add

Create `packages/core/src/market-normalization.test.ts` with Vitest coverage for:

1. American odds to implied probability.
2. Probability price to American odds.
3. Decimal odds to American odds.
4. Text normalization removes case and spacing differences.
5. Opposite side detection works for Over vs Under and Yes vs No.
6. Same-line opposite-side relationship passes.
7. Over 27.5 vs Under 28.5 is classified as `middle_line_split`.
8. Over 32.5 vs Under 27.5 is not a valid middle.
9. Same side markets are rejected.
10. Different player, period, or event returns a mismatch assessment.

## Export changes

In `packages/core/src/index.ts`, add:

```ts
export * from "./market-normalization";
```

In `packages/core/package.json`, add this export:

```json
"./market-normalization": "./src/market-normalization.ts"
```

Do not remove existing exports.

## Commands

Run from repo root in PowerShell:

```powershell
npx vitest run packages/core/src/market-normalization.test.ts
npm run test
```

## Acceptance criteria

This step is done when:

- `NormalizedMarket` exists in `@paperedge/core`.
- The module exports from both `packages/core/src/index.ts` and `packages/core/package.json`.
- All tests pass.
- No database, UI, API, or adapter files are modified.
- Claude can import `@paperedge/core/market-normalization` from other packages later.
