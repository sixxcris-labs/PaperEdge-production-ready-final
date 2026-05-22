# PaperEdge Step 3: ProphetX normalized market adapter

## Goal

Add a ProphetX adapter that converts captured ProphetX market depth and selection data into `NormalizedMarket` rows.

ProphetX is an exchange-style source and should be treated as a sharp or liquidity reference, not as a soft-book target.

## Depends on

Complete these first:

```txt
Step 1: Core normalized market model
Step 2: Novig adapter
```

## Repo placement

Add these files:

```txt
packages/core/src/adapters/prophetx.ts
packages/core/src/adapters/prophetx.test.ts
```

Update:

```txt
packages/core/src/adapters/index.ts
packages/core/package.json
```

Do not add HTTP fetching in this step. Normalize captured JSON only.

## Safety boundary

This adapter must not:

- Log in
- Fetch private endpoints
- Submit orders
- Place bets
- Route around restrictions
- Store credentials

It is a pure parser and normalizer.

## Known ProphetX raw shape

Captured fields may include:

```txt
eventId
market.id
market.name
market.displayName
market.type
market.subType
selections
selection.id
selection.name
selection.competitor
selection.player
selection.team
selection.line
selection.lineID
selection.odds
selection.displayOdds
selection.value
selection.stake
selection.updatedAt
```

## Required exports

Create in `packages/core/src/adapters/prophetx.ts`:

```ts
import type { NormalizedMarket } from "../market-normalization";

export type ProphetXRawMarket = unknown;

export type ProphetXNormalizeOptions = {
  sport?: string;
  league?: string;
  eventName?: string;
  eventId?: string;
  marketType?: string;
  period?: string;
  live?: boolean;
  receivedAt?: string;
};

export function normalizeProphetXMarkets(
  raw: ProphetXRawMarket | ProphetXRawMarket[],
  options?: ProphetXNormalizeOptions,
): NormalizedMarket[];
```

## Mapping rules

Map ProphetX fields into `NormalizedMarket` like this:

```txt
source              prophetx
sourceMarketId      market.id
sourceOutcomeId     selection.id or selection.lineID
sourceEventId       eventId
event_id            eventId or options.eventId
event_name          options.eventName or raw event name
sport               options.sport
league              options.league
market_type         options.marketType or market.displayName or market.name or market.type
player              selection.player or competitor/player name when market is player prop
side                normalized selection side, outcome side, team, over, under, yes, no
line                selection.line or selection.value when numeric
odds_american       parsed selection.displayOdds or selection.odds
implied_probability americanToImpliedProbability(odds_american)
liquidity           selection.stake
timestamp           selection.updatedAt or options.receivedAt or current ISO string
status              open if stake exists and odds exist, else unknown
live                options.live or raw live flag, default false
period              options.period or full_game
raw                 original selection with market context
```

## Odds parsing rules

Support these odds formats:

```txt
+115
-135
115
-135
1.87 decimal if clearly decimal odds
```

If odds cannot be parsed, emit the row with:

```txt
odds_american = null
implied_probability = null
```

Do not throw on unknown odds.

## Liquidity handling

`stake` should map to `liquidity`.

If stake is missing, emit the row but do not assume executable liquidity.

## Market type normalization

Map common ProphetX names to canonical values:

```txt
Moneyline          moneyline
Spread             spread
Total              total
Player Points      player_points
Player Rebounds    player_rebounds
Player Assists     player_assists
```

Leave unknown names as normalized text so later detection can still group them.

## Tests to add

Create `packages/core/src/adapters/prophetx.test.ts` with tests for:

1. A market with selections normalizes into rows.
2. `source` is `prophetx`.
3. `eventId` maps to `event_id`.
4. `market.id` maps to `sourceMarketId`.
5. `selection.id` maps to `sourceOutcomeId`.
6. `displayOdds: "+115"` parses to `115`.
7. `displayOdds: "-135"` parses to `-135`.
8. `stake` maps to liquidity.
9. Missing stake does not throw.
10. Market display names normalize to canonical market types when known.

## Export changes

In `packages/core/src/adapters/index.ts`, add:

```ts
export * from "./prophetx";
```

In `packages/core/package.json`, add:

```json
"./adapters/prophetx": "./src/adapters/prophetx.ts"
```

Do not remove existing exports.

## Commands

Run from repo root in PowerShell:

```powershell
npx vitest run packages/core/src/adapters/prophetx.test.ts
npx vitest run packages/core/src/adapters/novig.test.ts packages/core/src/adapters/prophetx.test.ts
npm run test
```

## Acceptance criteria

This step is done when:

- ProphetX captured market JSON normalizes to `NormalizedMarket[]`.
- Selection stake is preserved as liquidity.
- Odds parse robustly.
- Player/team side information survives normalization.
- Adapter exports are available.
- No live network or wagering behavior is added.
