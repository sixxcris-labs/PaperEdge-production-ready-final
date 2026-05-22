# PaperEdge Step 5: Kalshi normalized market adapter

## Goal

Add a Kalshi adapter that converts captured Kalshi sports prediction-market metadata, orderbook snapshots when available, and trade tape records into normalized research rows.

Kalshi can be useful as a market-flow signal. Do not treat trade tape alone as executable liquidity.

## Depends on

Complete these first:

```txt
Step 1: Core normalized market model
Step 2: Novig adapter
Step 3: ProphetX adapter
Step 4: Bovada adapter
```

## Repo placement

Add these files:

```txt
packages/core/src/adapters/kalshi.ts
packages/core/src/adapters/kalshi.test.ts
```

Update:

```txt
packages/core/src/adapters/index.ts
packages/core/package.json
```

Do not add authenticated API clients in this step. Normalize captured JSON only.

## Safety boundary

This adapter must not:

- Log in
- Submit orders
- Trade contracts
- Store credentials
- Bypass restrictions
- Claim liquidity from trade tape alone

This is a pure normalization layer for research and paper review.

## Known Kalshi raw shapes

Captured Kalshi market and event metadata can include:

```txt
event metadata
market metadata
settlement sources
series structures
live_data event state
market IDs
tickers
```

Captured trade tape fields can include:

```txt
trade_id
market_id
ticker
price
price_dollars
count
count_fp
taker_side
maker_action
taker_action
create_date
```

## Required exports

Create in `packages/core/src/adapters/kalshi.ts`:

```ts
import type { NormalizedMarket } from "../market-normalization";

export type KalshiRawMarket = unknown;
export type KalshiRawTrade = unknown;

export type KalshiNormalizeOptions = {
  sport?: string;
  league?: string;
  eventName?: string;
  eventId?: string;
  marketType?: string;
  period?: string;
  live?: boolean;
  receivedAt?: string;
};

export function normalizeKalshiMarkets(
  raw: KalshiRawMarket | KalshiRawMarket[],
  options?: KalshiNormalizeOptions,
): NormalizedMarket[];

export function normalizeKalshiTradeTape(
  raw: KalshiRawTrade | KalshiRawTrade[],
  options?: KalshiNormalizeOptions,
): NormalizedMarket[];
```

## Mapping rules for market snapshots

Map Kalshi market snapshot fields into `NormalizedMarket` like this:

```txt
source              kalshi
sourceEventId       event id when present
sourceMarketId      market_id or ticker
sourceOutcomeId     ticker plus side when needed
event_id            options.eventId or event id or series id
event_name          options.eventName or event title/name
sport               options.sport
league              options.league
market_type         options.marketType or normalized market title/category
player              null unless player market is explicit
side                yes or no for binary contract side, or outcome label when explicit
line                null unless contract has a numeric line
odds_american       probabilityToAmerican(price) when price is 0 to 1
implied_probability price when price is 0 to 1
liquidity           orderbook visible size only, if present
timestamp           options.receivedAt or market updated time or current ISO string
status              open/suspended/closed/unknown from raw status
live                options.live or live_data state
period              options.period or full_game/series as appropriate
raw                 original raw market context
```

## Mapping rules for trade tape

Trade tape rows are flow observations, not executable markets.

For trade tape:

```txt
source              kalshi
sourceMarketId      market_id or ticker
sourceOutcomeId     trade_id
event_id            options.eventId or market_id or ticker
event_name          options.eventName or ticker
side                taker_side or taker_action normalized
odds_american       probabilityToAmerican(price or price_dollars)
implied_probability price or price_dollars when 0 to 1
liquidity           count or count_fp as traded size, not available liquidity
 timestamp          create_date
status              unknown or closed-flow, not open liquidity
live                options.live or false
period              options.period or full_game
raw                 original trade row
```

Fix the spacing in implementation so the `timestamp` property has no leading whitespace.

Add a code comment:

```ts
// Trade tape count is executed size, not resting executable liquidity.
```

## Price handling

Kalshi prices may appear as cents or dollars.

Handle:

```txt
0.41 means 41 percent
41 means 41 cents, convert to 0.41
"0.41" parse as 0.41
"41" parse as 0.41 if the field is named price and exceeds 1
```

Then convert to American odds through `probabilityToAmerican`.

## Tests to add

Create `packages/core/src/adapters/kalshi.test.ts` with tests for:

1. A market snapshot normalizes to `NormalizedMarket[]`.
2. A trade tape row normalizes to `NormalizedMarket[]`.
3. `source` is `kalshi`.
4. `ticker` or `market_id` maps to source IDs.
5. `price: 41` maps to implied probability `0.41`.
6. `price_dollars: 0.59` maps to implied probability `0.59`.
7. Trade `count` maps to liquidity but is labeled in code as executed size, not available depth.
8. `create_date` maps to timestamp.
9. Missing event metadata does not throw.
10. Status remains conservative when unknown.

## Export changes

In `packages/core/src/adapters/index.ts`, add:

```ts
export * from "./kalshi";
```

In `packages/core/package.json`, add:

```json
"./adapters/kalshi": "./src/adapters/kalshi.ts"
```

Do not remove existing exports.

## Commands

Run from repo root in PowerShell:

```powershell
npx vitest run packages/core/src/adapters/kalshi.test.ts
npx vitest run packages/core/src/adapters/*.test.ts
npm run test
```

## Acceptance criteria

This step is done when:

- Captured Kalshi market and trade tape JSON normalize into `NormalizedMarket[]`.
- Trade tape is not misrepresented as executable liquidity.
- Cents and dollars price formats parse correctly.
- Adapter exports are available.
- No trading or live authenticated API behavior is added.
