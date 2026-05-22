# PaperEdge Step 2: Novig normalized market adapter

## Goal

Add the first source adapter: Novig to `NormalizedMarket`.

Novig is the priority because its orderbook depth can support PaperEdge hypotheses around stale takeable exchange liquidity, liquidity vanish, and exchange-vs-soft-book lag.

## Depends on

Complete Step 1 first:

```txt
packages/core/src/market-normalization.ts
```

## Repo placement

Add these files:

```txt
packages/core/src/adapters/novig.ts
packages/core/src/adapters/novig.test.ts
packages/core/src/adapters/index.ts
```

Update these files:

```txt
packages/core/src/index.ts
packages/core/package.json
```

Do not add live HTTP polling in this step. This adapter should normalize already-captured JSON only.

## Safety boundary

This adapter must not:

- Fetch authenticated endpoints
- Submit orders
- Place wagers
- Make liquidity
- Take liquidity
- Use credentials
- Bypass geofence, login, KYC, or rate limits

It only transforms manually captured or legally available raw JSON into normalized research records.

## Known Novig raw shape

Support the captured Novig book batch style:

```txt
market
outcomes
ladders
```

Known ladder fields include:

```txt
id
price
qty
originalQty
timestamp
status
tif
outcomeId
marketId
inverted
isBid
currency
```

Important Novig behavior:

- `asks: []` can be normal.
- Both sides may be represented as outcome bids.
- `price` may be a probability-style price such as `0.451`.
- `qty` is the visible liquidity field.
- `timestamp` should become the normalized timestamp when present.
- Exchange-style markets require liquidity and fee handling before any candidate can pass verification.

## Required exports

Create these exports in `packages/core/src/adapters/novig.ts`:

```ts
import type { NormalizedMarket } from "../market-normalization";

export type NovigBatchBookResponse = unknown;

export type NovigNormalizeOptions = {
  sport?: string;
  league?: string;
  eventName?: string;
  eventId?: string;
  marketType?: string;
  period?: string;
  live?: boolean;
  receivedAt?: string;
};

export function normalizeNovigMarkets(
  raw: NovigBatchBookResponse,
  options?: NovigNormalizeOptions,
): NormalizedMarket[];
```

## Mapping rules

Map Novig fields into `NormalizedMarket` like this:

```txt
source              novig
sourceMarketId      ladder.marketId or market.id
sourceOutcomeId     ladder.outcomeId or outcome.id
event_id            options.eventId or market.eventId or market.id
event_name          options.eventName or market.eventName or market.name
sport               options.sport or raw sport fallback
league              options.league or raw league fallback
market_type         options.marketType or market.name/displayName/type
player              player name when present, else null
side                outcome name or over/under/team side when derivable
line                market line or selection line when present
odds_american       probabilityToAmerican(ladder.price) when price is 0 to 1
implied_probability ladder.price when price is 0 to 1
liquidity           ladder.qty
timestamp           ladder.timestamp or options.receivedAt or new Date().toISOString()
status              open if ladder.status indicates active, else suspended or unknown
live                options.live or raw live flag, default false
period              options.period or normalized market period, default full_game
raw                 original raw item or ladder context
```

## Price handling

If `price` is between 0 and 1, treat it as an implied probability and convert with `probabilityToAmerican`.

Do not assume `price` is American odds.

If price is missing or invalid:

```txt
odds_american = null
implied_probability = null
```

## Liquidity handling

If `qty` is missing or zero, still emit the normalized market if the row is otherwise parseable, but set:

```txt
liquidity = null or 0
status = unknown or suspended depending on raw status
```

Do not mark a market as usable without visible liquidity.

## Tests to add

Create `packages/core/src/adapters/novig.test.ts` with tests for:

1. A minimal batch response normalizes to one or more `NormalizedMarket` rows.
2. `source` is `novig`.
3. Probability price `0.451` converts to positive American odds.
4. Probability price `0.521` converts to negative American odds.
5. `qty` maps to `liquidity`.
6. `timestamp` maps correctly.
7. Empty `asks` does not cause rejection.
8. Missing price does not throw.
9. Missing liquidity does not throw, but does not create a usable liquidity assumption.
10. Options override missing event, sport, league, market, period, and live fields.

## Export changes

Create `packages/core/src/adapters/index.ts`:

```ts
export * from "./novig";
```

In `packages/core/src/index.ts`, add:

```ts
export * from "./adapters";
```

In `packages/core/package.json`, add:

```json
"./adapters": "./src/adapters/index.ts",
"./adapters/novig": "./src/adapters/novig.ts"
```

Do not remove existing exports.

## Commands

Run from repo root in PowerShell:

```powershell
npx vitest run packages/core/src/adapters/novig.test.ts
npx vitest run packages/core/src/market-normalization.test.ts packages/core/src/adapters/novig.test.ts
npm run test
```

## Acceptance criteria

This step is done when:

- Raw Novig book-batch JSON can normalize into `NormalizedMarket[]`.
- Liquidity is preserved.
- Probability prices are converted correctly.
- Empty asks are accepted as normal.
- The adapter is exported from `@paperedge/core/adapters/novig`.
- No live network, order, or wagering behavior is added.
