# PaperEdge Step 4: Bovada normalized market adapter

## Goal

Add a Bovada adapter that converts captured Bovada sportsbook market JSON into `NormalizedMarket` rows.

Bovada is treated as a soft/offshore sportsbook target or comparison book. It is not an exchange liquidity source.

## Depends on

Complete these first:

```txt
Step 1: Core normalized market model
Step 2: Novig adapter
Step 3: ProphetX adapter
```

## Repo placement

Add these files:

```txt
packages/core/src/adapters/bovada.ts
packages/core/src/adapters/bovada.test.ts
```

Update:

```txt
packages/core/src/adapters/index.ts
packages/core/package.json
```

Do not add live fetching in this step. Normalize captured JSON only.

## Safety boundary

This adapter must not:

- Log in
- Scrape around controls
- Place wagers
- Submit betslips
- Store credentials
- Bypass restrictions

It only transforms captured Bovada JSON into normalized research records.

## Known Bovada raw shape

Captured Bovada fields may include:

```txt
event.id
event.description
event.startTime
event.live
event.status
event.competitors
market.id
market.description
market.displayGroups
market.type
market.key
market.period
market.status
outcome.id
outcome.description
outcome.status
outcome.type
outcome.price.id
outcome.price.american
outcome.price.decimal
outcome.price.fractional
outcome.price.handicap
outcome.price.handicap2
```

Observed status values include:

```txt
O = open
S = suspended
U = upcoming
```

## Required exports

Create in `packages/core/src/adapters/bovada.ts`:

```ts
import type { NormalizedMarket } from "../market-normalization";

export type BovadaRawEvent = unknown;

export type BovadaNormalizeOptions = {
  sport?: string;
  league?: string;
  receivedAt?: string;
};

export function normalizeBovadaMarkets(
  raw: BovadaRawEvent | BovadaRawEvent[],
  options?: BovadaNormalizeOptions,
): NormalizedMarket[];
```

## Mapping rules

Map Bovada fields into `NormalizedMarket` like this:

```txt
source              bovada
sourceEventId       event.id
sourceMarketId      market.id
sourceOutcomeId     outcome.id
event_id            event.id
event_name          event.description or joined competitors
sport               options.sport or raw sport path
league              options.league or raw league path
market_type         market.description or market.key or market.type
player              player name parsed from prop market if safely derivable, else null
side                outcome.description or outcome.type normalized
line                outcome.price.handicap or handicap2 when numeric
odds_american       outcome.price.american if numeric, else decimalToAmerican(decimal)
implied_probability americanToImpliedProbability(odds_american)
liquidity           null, because Bovada displayed odds do not equal accepted stake
 timestamp          options.receivedAt or current ISO string
status              map O/S/U to open/suspended/upcoming
live                Boolean(event.live)
period              market.period normalized, default full_game
raw                 original outcome with event and market context
```

Fix the spacing in implementation so the `timestamp` property has no leading whitespace.

## Bovada-specific rule

Never use displayed Bovada odds as proof of executable stake.

Normalized Bovada rows should set:

```txt
liquidity = null
```

Accepted stake or max stake belongs later in verification or paper-lock records, not in the raw market normalizer.

## Period handling

Normalize common period labels:

```txt
Game or Full Game       full_game
1st Half                first_half
2nd Half                second_half
1st Quarter             first_quarter
Regulation              regulation
```

If unknown, preserve normalized text.

## Tests to add

Create `packages/core/src/adapters/bovada.test.ts` with tests for:

1. A Bovada event with markets and outcomes normalizes into rows.
2. `source` is `bovada`.
3. Event ID, market ID, and outcome ID are preserved.
4. American odds parse correctly.
5. Decimal odds convert if American odds are missing.
6. Handicap maps to line.
7. Status `O` maps to `open`.
8. Status `S` maps to `suspended`.
9. Status `U` maps to `upcoming`.
10. Liquidity is always null unless a future explicit accepted-stake source is passed.

## Export changes

In `packages/core/src/adapters/index.ts`, add:

```ts
export * from "./bovada";
```

In `packages/core/package.json`, add:

```json
"./adapters/bovada": "./src/adapters/bovada.ts"
```

Do not remove existing exports.

## Commands

Run from repo root in PowerShell:

```powershell
npx vitest run packages/core/src/adapters/bovada.test.ts
npx vitest run packages/core/src/adapters/*.test.ts
npm run test
```

## Acceptance criteria

This step is done when:

- Captured Bovada event JSON normalizes to `NormalizedMarket[]`.
- Status mapping works.
- Handicap/line handling works.
- Displayed Bovada odds do not become assumed liquidity.
- Adapter exports are available.
- No betting, betslip, login, or live fetch logic is added.
