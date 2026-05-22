# PaperEdge: Automatic Ingestion + Edge-Quality Plan

Status: PLAN (not yet built). Owner: Cristian. Created 2026-05-22.

Goal: stop capturing book JSON by hand. Poll both books automatically, normalize +
validate + test the moment data lands, and upgrade the engine from "two-book price
sum" to real edge discovery (de-vig fair value, executable liquidity, more books).

This supersedes the manual capture loop. It builds on what already exists:
adapters (`packages/core/src/adapters/{bovada,novig,prophetx}.ts`), runners
(`scripts/normalize-*.ts`, `compare-books.ts`, `detect-edges.ts`), and the
edge engine (`detectEdgeSignals`, `edgeSignalsToReviewItems`).

---

## 0. Safety boundary (read first — non-negotiable)

Per the Bovada/Novig handoffs and project ADRs, the automated pull MUST NOT:
- log in programmatically, submit betslips, place wagers, or store credentials;
- scrape around access controls, captchas, or rate limits;
- commit any token, cookie, account id, or PII to the repo.

Chosen access mode: **polite polling, session from env.**
- Poll the same JSON endpoints already observed in dev tools.
- Any auth (e.g. Novig session token) is read at runtime from an env var the
  user supplies (`NOVIG_SESSION`, etc.); it is never written to disk or git.
- Conservative, fixed rate limit with jitter; honor 429/Retry-After; back off.
- A kill switch + `--fixtures` mode that replays saved JSON with zero network.
- `.env`, tokens, and `raw_data/incoming/**` are gitignored.

Open compliance check (user to confirm before enabling live mode): both books'
ToS permit read-only odds polling at the chosen rate. Until confirmed, default
to fixtures-replay.

---

## Phase 1 — Automatic capture (polling fetchers)

Outcome: both books captured near-simultaneously on an interval, written as
timestamped raw JSON tagged with a shared capture id.

- [ ] `scripts/fetch/config.ts` — endpoints, events to track, headers; secrets via
      `process.env` only. Per-book rate limits. No secrets in file.
- [ ] `scripts/fetch/bovada.ts` — GET the public event/coupon JSON; write raw.
- [ ] `scripts/fetch/novig.ts` — POST the GraphQL query for the event; auth header
      from `process.env.NOVIG_SESSION` (optional; skip with warning if absent).
- [ ] `scripts/fetch/poll.ts` — orchestrator: every N seconds fire both fetchers
      *in the same tick*, stamp each file with `capture_id` + ISO `captured_at`,
      write to `raw_data/incoming/<capture_id>/<book>_<market_scope>.json`.
      Flags: `--once`, `--interval=Ns`, `--fixtures`, `--events=<file>`.
- [ ] HTTP client: timeout, retry w/ backoff, 429 handling, jitter, max-rate guard.
- [ ] `.gitignore`: `raw_data/incoming/`, `.env*`, `*.session`.
- [ ] `.env.example` documenting `NOVIG_SESSION` etc. (no real values).

Simultaneity matters: cross-book arbs are only real if both quotes are live at the
same instant. The poller must capture both books within the same tick and record
per-file `captured_at` so freshness gating (Phase 3d) can reject stale pairs.

---

## Phase 2 — Auto-normalize + auto-validate + auto-test on capture

Outcome: the instant a raw JSON lands (from the poller OR a manual drop), it is
normalized, schema-validated, and the relevant tests run — pass/fail logged.

- [x] `packages/core/src/normalized-market.schema.ts` — hand-rolled
      `validateNormalizedRow`/`validateNormalizedRows` + `isNormalizedMarket`
      guard. Exported from core index. Tested (normalized-market.schema.test.ts).
- [x] Book/shape auto-detection: `scripts/lib/ingest.ts` `detectBook()`
      (filename hint + structural sniff) + `normalizeByBook()` dispatch.
      Verified against all current raw_data files.
- [x] `scripts/watch-ingest.ts` — watch `raw_data/**`; on change:
      1) detect book, 2) run adapter, 3) guard 0-priced (don't clobber output),
      4) `validateNormalizedRows()` (fail loudly), 5) write JSONL,
      6) run the adapter's vitest, 7) one-line PASS/FAIL. Modes: default watch,
      `--once`, `<path>`, `--no-test`, `--pipeline` (refresh detect-edges).
- [x] npm scripts: `ingest` (--once), `ingest:watch`, `ingest:pipeline`.
      WSL: `TMPDIR=/tmp npx tsx scripts/watch-ingest.ts`.
- [x] Multi-market fixtures: watcher recurses `raw_data/**`, so
      `raw_data/fixtures/<sport>/<market>/*.json` is auto-exercised. (NOTE: output
      is per-book `<book>_normalized.jsonl`; multi-event/multi-sport routing of
      outputs is a later refinement.)
- [ ] Extend `npm run validate` to run `validateNormalizedRows` on fixtures.
- [ ] Dedicated fixtures test that loads each fixture and asserts it normalizes
      + validates (hardens adapters as Cristian adds samples).

Note (env): vitest/tsx run under WSL (`node_modules` has Linux binaries). The
watcher must run there too; on Windows host only `tsc` (typecheck) works.

---

## Phase 3 — Edge-quality upgrades (do all; ordered by leverage)

### 3a. De-vig / no-vig fair value  ★ highest leverage, no new data
- [ ] `packages/core/src/fair-value.ts` — for each two-way market, strip vig
      (proportional + multiplicative methods) to get fair prob per side.
- [ ] Build a cross-book consensus fair line (median/weighted across books).
- [ ] New signal: `book_beats_consensus` — a book priced better than fair by a
      threshold = +EV even without a clean 2-sided arb (this is where most real
      edges live — soft-book lag). Wire into `detectEdgeSignals` or a sibling.
- [ ] Tests: known vig examples; consensus across 2 and 3 books.

### 3b. Liquidity / executable depth
- [ ] Ingest the order-book ladder shape for the FULL event (Novig `{market,
      ladders}` with `qty`); thread `qty` -> `liquidity`, and best-bid/ask depth.
- [ ] Size candidates: max stake at the quoted price; rank edges by $ available,
      not just %.
- [ ] Gate candidates on minimum executable size (configurable).

### 3c. Fee / effective-price model
- [ ] `packages/core/src/book-fees.ts` — per-book fee/payout adjustment
      (exchange commission vs clean payout). Apply before scoring so gross
      100.7% pairs that are net-negative are correctly rejected.

### 3d. Synchronized freshness end-to-end
- [ ] Carry per-quote `captured_at` through normalization (don't overwrite with
      `now`). Engine freshness gate uses real capture times; reject pairs whose
      captures are >X seconds apart. Surface the spread in the signal.

### 3e. More books (widen the market)
- [ ] Turn on the existing **ProphetX** adapter in the pipeline + add its fetcher.
- [ ] Make `detect-edges`/`compare-books` N-book aware (already source-bucketed;
      generalize beyond exactly 2 sources).

### 3f. Stable identity (competitor + player IDs)  → unlocks props
- [ ] Thread a shared id (Novig exposes `optic_odds_id`/`swish_id`) through the
      adapters so team + player matching is exact, replacing `TEAM_ALIASES`.
- [ ] Player-prop matching: player id + stat type + line. Unlocks the 405-market
      prop surface (the least efficient, fattest-edge markets).
- [ ] Build/curate an id crosswalk where books don't share an id.

### 3g. Settlement-rule alignment
- [ ] Capture/normalize settlement metadata (OT inclusion, push rules, half/qtr
      definitions). Reconciliation must verify settlement equivalence before a
      match counts as an arb/middle.

### 3h. Team-spread middles (the deferred item)
- [ ] Extend `hasMiddleLineRelationship` for mirror spreads with a corridor
      (e.g. OKC -2.5 / SAS +3.5 middles on a 3-point margin). Add middle notes +
      calculator routing. Tests.

---

## Phase 4 — Output, history, alerting

- [ ] Persist `edge_signals` over time (jsonl/db) with capture timestamps.
- [ ] Threshold alerts: combined < 100% (arb) or +EV vs consensus beyond N%.
- [ ] Lightweight report (CSV/console now; dashboard later per ADR-002).

---

## What Cristian provides (parallel track)
- Sample raw JSON for additional markets/sports to drop in
  `raw_data/fixtures/<sport>/<market>/` (props, totals, other leagues), so the
  Phase 2 watcher + tests exercise them and the adapters get hardened.
- The `NOVIG_SESSION` (and any other) token at runtime via env for live polling.
- Confirmation that polling rate/use is within each book's ToS before live mode.

## Suggested build order
1. Phase 2 (watcher + schema validation) — immediate value, works on fixtures today.
2. Phase 1 (pollers) — once ToS confirmed; fixtures mode meanwhile.
3. Phase 3a (de-vig) + 3b (depth) — biggest edge-quality jump.
4. Phase 3e/3f (more books + ids) — widen market, unlock props.
5. Phase 3c/3d/3g, then 3h, then Phase 4.
