# PaperEdge Scanners-Only Handoff

This is the trimmed version of the upgrade. It only adds automated market-data scanning and normalized-output capture for Bovada and Novig. It does not add edge detection changes, player-prop detection changes, dashboard changes, bet placement, sportsbook actions, login bypassing, or geolocation workarounds.

PaperEdge should still treat outputs as market-data observations only. A candidate cannot become a valid paper lock unless it later passes the verification gates: same event, same market, same period, same line unless classified as a middle, opposite sides, live odds, visible stake or liquidity, correct calculator, bankroll review, and settlement source.

## Files to copy

Copy these files into the repo at the same paths:

```text
scripts/poll-market-data.ts
config/paperedge.scanner.config.example.json
package.scripts.patch.json
docs/PAPEREDGE_SCANNERS_ONLY_HANDOFF.md
```

Then add the package scripts from `package.scripts.patch.json` into your root `package.json`.

## What the scanner does

`scripts/poll-market-data.ts`:

1. Reads `config/paperedge.scanner.config.json`.
2. Polls configured Bovada and Novig market-data URLs.
3. Writes timestamped raw responses to `raw_data/<book>/`.
4. Runs existing adapters only:
   - `normalizeBovadaMarkets()`
   - `normalizeNovigMarkets()`
5. Writes timestamped normalized request outputs to `normalized_data/<book>/`.
6. Writes latest aggregate normalized files:
   - `normalized_data/bovada_normalized.jsonl`
   - `normalized_data/novig_normalized.jsonl`
   - `normalized_data/scanner_normalized.jsonl`
7. Writes request logs to `logs/market_data_poll_log.jsonl`.
8. Stores ETags in `logs/market_data_etags.json` and sends `If-None-Match` on later polls when available.

## What it does not do

It does not:

- Place bets.
- Click bet slips.
- Submit sportsbook actions.
- Bypass login, geolocation, KYC, or app controls.
- Rewrite your existing normalized model.
- Duplicate detection logic.
- Run arb/middle detection.
- Create review candidates.

## Expected existing project functions

This scanner assumes your existing repo already has:

```ts
normalizeBovadaMarkets(raw, options)
normalizeNovigMarkets(raw, options)
```

from:

```text
packages/core/src/adapters/bovada
packages/core/src/adapters/novig
```

and the existing `NormalizedMarket` type from:

```text
packages/core/src/market-normalization
```

## Config setup

From the repo root:

```powershell
Copy-Item .\config\paperedge.scanner.config.example.json .\config\paperedge.scanner.config.json
notepad .\config\paperedge.scanner.config.json
```

Replace the placeholder URLs with market-data endpoints you are authorized to access.

Example Bovada request object:

```json
{
  "id": "bovada-nba-event-25653704",
  "url": "https://www.bovada.lv/services/sports/event/coupon/events/A/description/basketball/nba/example-event?lnGrp=2&lang=en",
  "sport": "basketball",
  "league": "nba",
  "period": "full_game",
  "live": false
}
```

Example Novig request object:

```json
{
  "id": "novig-book-batch-example",
  "url": "https://api.novig.us/nbx/v1/markets/book/batch?marketIds=MARKET_ID_HERE&currency=CASH",
  "marketId": "MARKET_ID_HERE",
  "sport": "basketball",
  "league": "nba",
  "period": "full_game",
  "live": false
}
```

## PowerShell commands

Install dependencies if needed:

```powershell
npm install
```

Run one scan cycle:

```powershell
npm run scan:market-data:once
```

Or run with an explicit config path:

```powershell
npm run scan:market-data -- --config .\config\paperedge.scanner.config.json --once
```

Run continuous polling:

```powershell
npm run scan:market-data -- --config .\config\paperedge.scanner.config.json
```

The continuous poll interval is controlled by:

```json
"pollIntervalSeconds": 30
```

## Output files

Raw timestamped responses:

```text
raw_data/bovada/<timestamp>_<request-id>.json
raw_data/novig/<timestamp>_<request-id>.json
```

Per-request normalized snapshots:

```text
normalized_data/bovada/<timestamp>_<request-id>.jsonl
normalized_data/novig/<timestamp>_<request-id>.jsonl
```

Latest aggregate normalized files:

```text
normalized_data/bovada_normalized.jsonl
normalized_data/novig_normalized.jsonl
normalized_data/scanner_normalized.jsonl
```

Logs:

```text
logs/market_data_poll_log.jsonl
logs/market_data_etags.json
```

Each log row includes:

```text
timestamp
source
requestId
requestUrl
eventId
marketId
requestStatus
rawOutputPath
normalizedOutputPath
rawBytes
normalizedRowsWritten
error
```

## How this fits PaperEdge

This scanner is the automated data-capture layer only. The next step in your existing flow can consume:

```text
normalized_data/scanner_normalized.jsonl
```

or the book-specific files:

```text
normalized_data/bovada_normalized.jsonl
normalized_data/novig_normalized.jsonl
```

Your existing detection or review workflow should stay downstream of those files.

## Safe operating rule

Use the scanner for observation, logging, and normalization only. Verification, stake acceptance, liquidity, sportsbook rules, bankroll exposure, and settlement source still belong in PaperEdge's manual Verify, Lock, Settle, Learn workflow.
