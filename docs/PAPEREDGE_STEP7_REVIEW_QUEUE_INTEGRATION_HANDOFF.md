# PaperEdge Step 7: Manual review queue integration

## Goal

Wire normalized edge signals into a manual review path so PaperEdge users can inspect candidate signals before creating or importing a paper-trade opportunity.

This step should keep the PaperEdge model intact:

```txt
Normalize raw markets
Detect research signals
Review manually
Verify gates
Paper lock only after verification
Settle and learn
```

## Depends on

Complete these first:

```txt
Step 1: Core normalized market model
Step 2: Novig adapter
Step 3: ProphetX adapter
Step 4: Bovada adapter
Step 5: Kalshi adapter
Step 6: Edge signal engine
```

## Repo placement

Start with a local/manual integration only.

Preferred files to add:

```txt
packages/core/src/edge-signal-import.ts
packages/core/src/edge-signal-import.test.ts
```

Optional UI follow-up after the core mapper works:

```txt
apps/dashboard/app/trades/import/NormalizedSignalsImportClient.tsx
apps/dashboard/app/trades/import/normalized-signals-actions.ts
```

Do not start with UI. Build and test the core mapper first.

## Safety boundary

This step must not:

- Auto-create locked trades
- Auto-place wagers
- Auto-submit orders
- Treat a signal as a verified paper lock
- Skip verification gates
- Store credentials or feed secrets

Signals should enter as raw or watch candidates only.

## Required core exports

Create these types in `packages/core/src/edge-signal-import.ts`:

```ts
import type { EdgeSignal } from "./edge-signal-engine";

export type ReviewQueueStatus = "raw_candidate" | "watch" | "rejected";

export type EdgeSignalReviewItem = {
  id: string;
  signalId: string;
  status: ReviewQueueStatus;
  title: string;
  summary: string;
  sourceNames: string[];
  eventName: string;
  marketType: string;
  player?: string | null;
  period: string;
  verificationChecklist: string[];
  rawSignal: EdgeSignal;
};

export function edgeSignalToReviewItem(signal: EdgeSignal): EdgeSignalReviewItem;
export function edgeSignalsToReviewItems(signals: EdgeSignal[]): EdgeSignalReviewItem[];
```

## Mapping rules

Map signal severity into review status:

```txt
candidate -> raw_candidate
watch     -> watch
info      -> watch
reject    -> rejected
```

Do not create a `locked` or `verified` status from signals.

## Required checklist

Every review item must include these checklist items:

```txt
Same event verified
Same player verified if player market
Same market verified
Same period verified
Same line verified or explicitly classified as middle
Opposite sides verified
Odds verified live
Freshness window checked
Stake accepted or visible exchange liquidity checked
Correct calculator selected
Bankroll exposure acceptable
Rollover, redemption, fee, or book-risk rules checked
Settlement source identified
```

Add extra checklist items depending on signal type:

### `line_split_middle`

```txt
Middle corridor modeled
Push scenario modeled
Settlement and OT treatment checked on both books
```

### `exchange_stale_liquidity_watch`

```txt
Confirm taking liquidity, not making liquidity
Confirm fee-adjusted odds
Confirm partial-fill assumptions
Confirm liquidity still visible before lock
```

### `soft_book_lag_watch`

```txt
Confirm soft-book slip accepted or paper-accepted
Confirm odds-change behavior
Confirm displayed odds are still live
```

### `market_mismatch_reject`

```txt
Record rejection reason
Tag mistake type
Do not paper lock
```

## Tests to add

Create `packages/core/src/edge-signal-import.test.ts` with tests for:

1. Candidate signal maps to raw candidate.
2. Watch signal maps to watch.
3. Reject signal maps to rejected.
4. Verification checklist always includes universal gates.
5. Middle signal includes middle-specific checklist items.
6. Exchange watch includes liquidity, fee, and partial-fill checklist items.
7. Soft-book lag includes accepted stake and odds-change checklist items.
8. Rejection signal includes do-not-lock checklist item.
9. Source names are deduped.
10. Missing player does not throw for non-player markets.

## Export changes

In `packages/core/src/index.ts`, add:

```ts
export * from "./edge-signal-import";
```

In `packages/core/package.json`, add:

```json
"./edge-signal-import": "./src/edge-signal-import.ts"
```

Do not remove existing exports.

## Optional UI phase after tests pass

Only after the core mapper has tests, add a manual import screen that:

1. Lets the user paste normalized signal JSON.
2. Shows each signal as raw candidate, watch, or rejected.
3. Requires the user to manually select a signal before importing.
4. Sends it into the existing opportunity/import flow as unverified.
5. Does not lock a trade automatically.

The UI should label every item clearly as:

```txt
Research signal, not verified edge
```

## Commands

Run from repo root in PowerShell:

```powershell
npx vitest run packages/core/src/edge-signal-import.test.ts
npx vitest run packages/core/src/edge-signal-engine.test.ts packages/core/src/edge-signal-import.test.ts
npm run test
```

## Acceptance criteria

This step is done when:

- Edge signals map into review items.
- Review items require manual verification.
- Rejected signals cannot become locks.
- Core tests pass.
- Optional UI, if added, only imports unverified review items.
- No automated sportsbook or prediction-market actions are added.
