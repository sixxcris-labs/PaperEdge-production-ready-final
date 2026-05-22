# PaperEdge market scanner upgrades integration handoff

This handoff integrates the three requested upgrades without replacing the existing PaperEdge architecture. The implementation keeps the normalized market model, adapters, `detectEdgeSignals()`, and `edgeSignalsToReviewItems()` as the center of the workflow.

The scanner is still research and paper-trading infrastructure only. It fetches configured market data, normalizes it, detects candidate edge hypotheses, and writes review artifacts. It does not place bets, automate sportsbook actions, bypass geolocation, or bypass login systems.

## What was added

### Phase 1: Bovada + Novig automation

New files:

- `scripts/poll-market-scanner.ts`
- `config/paperedge.poller.config.json`

Updated files:

- `package.json`
- `scripts/detect-edges.ts`
- `scripts/lib/ingest.ts`
- `scripts/watch-ingest.ts`
- `scripts/normalize-bovada.ts`

Behavior:

- Polls configured Bovada and Novig URLs or event/market IDs.
- Writes raw responses to `raw_data/<book>/`.
- Writes per-request normalized JSONL to `normalized_data/<book>/`.
- Writes aggregate normalized files to:
  - `normalized_data/bovada_normalized.jsonl`
  - `normalized_data/novig_normalized.jsonl`
- Runs `detectEdgeSignals()` after every poll cycle.
- Writes detection outputs to:
  - `normalized_data/edge_signals.jsonl`
  - `normalized_data/review_candidates.jsonl`
- Logs each request and engine cycle to `logs/poller.jsonl`.

Logged fields include timestamp, source, request URL, market/event ID, request status, markets parsed, normalized rows written, output paths, and errors.

### Phase 2: MLB arb fix + multi-sport detection

Updated files:

- `packages/core/src/market-normalization.ts`
- `packages/core/src/edge-signal-engine.ts`
- `packages/core/src/edge-signal-import.ts`
- `scripts/arbs-report.ts`
- `scripts/compare-books.ts`
- `scripts/fair-value-report.ts`
- `scripts/detect-edges.ts`

Tests:

- `packages/core/src/market-normalization.test.ts`
- `packages/core/src/edge-signal-engine.test.ts`
- `packages/core/src/edge-signal-import.test.ts`

Behavior:

- Removed runtime OKC/SAS and NBA-only assumptions from scanner scripts and detection paths.
- Supports any sport/league present in normalized data, including MLB, NBA, NHL, NFL, NCAAB, and NCAAF.
- Fixes moneyline opposite-side detection for generic team sides.
- Recomputes arb implied probability from `odds_american` inside detection.
- Ignores imported `implied_probability` for arb decisions.
- Rejects same-book pairs.
- Rejects same-side pairs.
- Rejects event, market, player, period, and line mismatches when they are near candidate matches.
- Classifies line-split opposite-side pairs as `middle_candidate`, not guaranteed same-line arbs.

Required utility added and exported from `packages/core/src/market-normalization.ts`:

```ts
export function impliedFromAmerican(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}
```

Same-line arb rule now used by the engine:

```ts
combinedImplied = impliedFromAmerican(bookA.odds_american) + impliedFromAmerican(bookB.odds_american);
trueArb = combinedImplied < 1;
```

### Phase 3: Player props pipeline

New file:

- `packages/core/src/player-props.ts`

Updated files:

- `packages/core/src/adapters/bovada.ts`
- `packages/core/src/adapters/novig.ts`
- `packages/core/src/adapters/rebet.ts`
- `packages/core/src/index.ts`
- `packages/core/package.json`

Tests:

- `packages/core/src/player-props.test.ts`
- `packages/core/src/adapters/bovada.test.ts`
- `packages/core/src/adapters/novig.test.ts`
- `packages/core/src/adapters/rebet.test.ts`

Player props now flow through the same normalized market model:

```ts
{
  source,
  event_id,
  event_name,
  sport,
  league,
  market_type,
  player,
  side,
  line,
  odds_american,
  implied_probability,
  liquidity,
  timestamp,
  status,
  live,
  period
}
```

The adapters normalize player name, stat market, period, side, line, odds, event, source/book, timestamp, liquidity when available, and status/open/suspended when present.

Canonical player prop market examples:

- `player_hits`
- `player_total_bases`
- `player_strikeouts`
- `player_points`
- `player_rebounds`
- `player_assists`
- `player_points_rebounds_assists`
- `player_threes_made`
- `player_shots_on_goal`
- `player_saves`
- `player_passing_yards`
- `player_rushing_yards`
- `player_receiving_yards`
- `player_receptions`

## Configure the poller

Edit `config/paperedge.poller.config.json`.

The checked-in config intentionally uses placeholder URLs:

```json
{
  "enabledBooks": ["bovada", "novig"],
  "sport": "mlb",
  "league": "mlb",
  "pollIntervalSeconds": 30,
  "outputDirectories": {
    "raw": "raw_data",
    "normalized": "normalized_data",
    "logs": "logs"
  },
  "detection": {
    "maxFreshnessSeconds": 60,
    "signalsFile": "edge_signals.jsonl",
    "reviewFile": "review_candidates.jsonl"
  },
  "books": {
    "bovada": {
      "enabled": true,
      "requests": [
        {
          "id": "replace-with-bovada-event-id",
          "url": "https://example.invalid/bovada/event-or-market-api-url",
          "eventName": "Away Team @ Home Team"
        }
      ]
    },
    "novig": {
      "enabled": true,
      "requests": [
        {
          "id": "replace-with-novig-event-or-market-id",
          "url": "https://example.invalid/novig/event-or-market-api-url",
          "eventName": "Away Team @ Home Team"
        }
      ]
    }
  }
}
```

Replace each placeholder URL with the market or event API URL you are permitted to fetch. If you use templated URLs, configure `urlTemplate` plus `eventIds` or `marketIds`, for example:

```json
{
  "books": {
    "bovada": {
      "enabled": true,
      "urlTemplate": "https://your-allowed-source.example/events/{eventId}",
      "eventIds": ["event-123", "event-456"]
    },
    "novig": {
      "enabled": true,
      "urlTemplate": "https://your-allowed-source.example/markets/{marketId}",
      "marketIds": ["market-abc", "market-def"]
    }
  }
}
```

Headers are supported for normal API access you are allowed to use:

```json
{
  "books": {
    "novig": {
      "enabled": true,
      "headers": {
        "accept": "application/json"
      },
      "requests": [
        {
          "id": "market-abc",
          "url": "https://your-allowed-source.example/markets/market-abc"
        }
      ]
    }
  }
}
```

Do not store secrets in the committed config. Use a local ignored config file if credentials or sensitive headers are required.

## PowerShell commands for Windows

Install dependencies:

```powershell
npm install
```

Run one full poll, normalize, detect cycle:

```powershell
npm run scan:markets -- --config .\config\paperedge.poller.config.json
```

Run continuous polling:

```powershell
npm run scan:markets:watch -- --config .\config\paperedge.poller.config.json
```

Run edge detection on already-normalized files:

```powershell
npm run detect:edges
```

Run the arb and middle report:

```powershell
npm run edges:arbs
```

Run the fair-value report:

```powershell
npm run edges:fairvalue
```

Run the targeted tests for these upgrades:

```powershell
npm test -- packages/core/src/market-normalization.test.ts packages/core/src/edge-signal-engine.test.ts packages/core/src/player-props.test.ts packages/core/src/adapters/bovada.test.ts packages/core/src/adapters/novig.test.ts packages/core/src/adapters/rebet.test.ts packages/core/src/edge-signal-import.test.ts
```

## How to inspect outputs

Tail poller logs:

```powershell
Get-Content .\logs\poller.jsonl -Tail 20
```

Inspect normalized Bovada rows:

```powershell
Get-Content .\normalized_data\bovada_normalized.jsonl -Tail 5 | ForEach-Object { $_ | ConvertFrom-Json }
```

Inspect normalized Novig rows:

```powershell
Get-Content .\normalized_data\novig_normalized.jsonl -Tail 5 | ForEach-Object { $_ | ConvertFrom-Json }
```

Inspect edge signals:

```powershell
Get-Content .\normalized_data\edge_signals.jsonl -Tail 20 | ForEach-Object { $_ | ConvertFrom-Json }
```

Inspect review-ready PaperEdge candidates:

```powershell
Get-Content .\normalized_data\review_candidates.jsonl -Tail 20 | ForEach-Object { $_ | ConvertFrom-Json }
```

Inspect the CSV arb/middle report:

```powershell
Import-Csv .\normalized_data\cross_book_arbs.csv | Format-Table -AutoSize
```

## How false-positive arbs are prevented

The scanner now treats apparent arbs as candidate edge hypotheses only.

A same-line arb candidate must pass all of these checks:

1. Different books.
2. Same event.
3. Same sport and league.
4. Same market type.
5. Same player when `player` is present.
6. Same period.
7. Opposite sides.
8. Same line for standard arb.
9. Open status on both sides.
10. Fresh timestamps inside the configured freshness window.
11. Finite nonzero `odds_american` on both sides.
12. Combined implied probability recomputed from `odds_american` under 100%.

The engine does not trust imported `implied_probability` for arb checks. This prevents false positives such as:

- `+280` and `-345`
- `+141` and `-164`

Those pairs are evaluated as `not_arb` because their recomputed combined implied probability is not under 100%.

Same-book pairs are rejected. Same-side pairs are rejected. Line splits are classified as `middle_candidate`, not same-line arb.

## How player props are classified

Player props are first-class normalized markets. A player prop is recognized when the adapter can derive a canonical `market_type` beginning with `player_` and a normalized `player` identity.

Examples:

| Raw label | Canonical market type |
|---|---|
| Player Points | `player_points` |
| Pitcher Strikeouts | `player_strikeouts` |
| Hits | `player_hits` |
| Total Bases | `player_total_bases` |
| Shots On Goal | `player_shots_on_goal` |
| Receiving Yards | `player_receiving_yards` |

Same-line player prop arb candidate:

- Same event
- Same player
- Same stat market
- Same period
- Opposite sides
- Same line
- Recomputed combined implied under 100%

Line-split player prop middle candidate:

- Same event
- Same player
- Same stat market
- Same period
- Opposite sides
- Over line below under line
- Classified as `middle_candidate`, not guaranteed arb

Mismatch reject examples:

- Points vs points + assists
- Full game vs first half
- Aaron Judge hits vs Rafael Devers hits
- Over 3.5 vs Under 1.5
- Same book on both sides
- Same side on both books

Exchange-style liquidity warning:

- Novig and other exchange-style rows require visible liquidity for executable watch classification.
- If exchange liquidity is missing or zero, the output is an `insufficient_data_watch`, not an arb candidate.

## PaperEdge prosecutor fields

Every review item in `review_candidates.jsonl` includes:

- `classification`
- `combinedImplied` when applicable
- `trueArb` when applicable
- `verificationChecklist`
- `prosecutorRules.mechanism`
- `prosecutorRules.responsibleParticipant`
- `prosecutorRules.limitToArbitrage`
- `prosecutorRules.manualCapturePath`
- `prosecutorRules.killCondition`
- `prosecutorRules.rejectionReason` when rejected or not an arb

The language intentionally says candidate edge, hypothesis, watch, or reject. It does not call anything profitable. Profitability requires paper-trading evidence, settlement review, realistic cost assumptions, and capacity review outside the scanner.

## Output status and classification values

Signal severities:

- `candidate`
- `watch`
- `info`
- `reject`

Signal classifications:

- `true_arb_candidate`
- `not_arb`
- `middle_candidate`
- `watch`
- `reject`

Review statuses:

- `raw_candidate`
- `watch`
- `rejected`

## Integration checklist

1. Copy the changed files into the existing PaperEdge repo, preserving paths.
2. Run `npm install` if dependencies are missing.
3. Replace placeholder URLs in `config/paperedge.poller.config.json` with permitted Bovada and Novig market/event API URLs.
4. Set `sport`, `league`, and `eventName` values for each request when the upstream response does not provide them reliably.
5. Run one cycle with `npm run scan:markets -- --config .\config\paperedge.poller.config.json`.
6. Confirm raw files appear under `raw_data/`.
7. Confirm normalized JSONL appears under `normalized_data/`.
8. Confirm `edge_signals.jsonl` and `review_candidates.jsonl` are written.
9. Review candidates manually through the PaperEdge Verify, Lock, Settle, Learn workflow.
10. Run targeted tests before merging.

## Notes for future extension

- Rebet player props are normalized through the adapter, but the Phase 1 poller intentionally only polls Bovada and Novig because that was the requested automation scope.
- New books should plug in through the same normalized market model and `detectEdgeSignals()` path.
- Do not add a second arb detector. Add targeted relationship checks or adapter fixes only when needed.
- Do not treat middle candidates as guaranteed arbs.
- Do not treat displayed odds as executable without accepted stake or visible exchange liquidity.
- Do not treat a candidate as valid without a settlement source.
