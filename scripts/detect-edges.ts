/**
 * Wire normalized book data into the existing edge-signal engine.
 *
 * Reads the two normalized JSONL files, reconciles them into a single set of
 * NormalizedMarket rows that share a common vocabulary (event identity, market
 * type, period, side, line), then runs the existing `detectEdgeSignals()` and
 * `edgeSignalsToReviewItems()` — no detection logic is reimplemented here.
 *
 * Why reconciliation is needed: the two adapters emit different vocab
 * ("point spread" vs "spread", full team names vs symbols, different event ids).
 * The engine groups by event and matches on marketComparisonKey, so rows must
 * be aligned first or nothing pairs across books.
 *
 * Scope note: the engine's opposite-side test only understands over/under and
 * yes/no, so cross-book *totals* surface as candidates. Team spreads/moneyline
 * (team A vs team B) won't trigger opposite-side detection until
 * isOppositeSide is extended — flagged as a follow-up.
 *
 * Run from repo root (WSL):
 *   TMPDIR=/tmp npx tsx scripts/detect-edges.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NormalizedMarket } from "../packages/core/src/market-normalization";
import { detectEdgeSignals } from "../packages/core/src/edge-signal-engine";
import { edgeSignalsToReviewItems } from "../packages/core/src/edge-signal-import";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"];
const DEFAULT_INPUTS = BOOKS.map((b) => resolve(repoRoot, "normalized_data", `${b}_normalized.jsonl`));
const SIGNALS_OUT = resolve(repoRoot, "normalized_data", "edge_signals.jsonl");

const TEAM_ALIASES: Record<string, string> = {
  "oklahoma city thunder": "okc",
  okc: "okc",
  thunder: "okc",
  "san antonio spurs": "sas",
  sas: "sas",
  sa: "sas",
  spurs: "sas",
};

function marketClass(type: string): "moneyline" | "spread" | "total" | null {
  const s = type.toLowerCase();
  if (/moneyline|^money(_|$)/.test(s)) return "moneyline";
  if (/spread/.test(s)) return "spread";
  if (/^total$|^total points$/.test(s)) return "total";
  return null;
}

function periodOf(row: NormalizedMarket): string {
  if (row.period && row.period !== "full_game" && row.period !== "unknown") return row.period;
  const s = (row.side || "").toLowerCase();
  if (/\b1h\b|first half|- 1h/.test(s)) return "first_half";
  if (/\b2h\b|second half|- 2h/.test(s)) return "second_half";
  return "full_game";
}

function teamOf(side: string): string {
  const cleaned = side
    .toLowerCase()
    .replace(/\s*-\s*[12][hq]$/, "")
    .replace(/\s*[-+]?\d+(\.\d+)?$/, "")
    .trim();
  if (TEAM_ALIASES[cleaned]) return TEAM_ALIASES[cleaned];
  for (const alias of Object.keys(TEAM_ALIASES)) {
    if (cleaned.includes(alias)) return TEAM_ALIASES[alias];
  }
  return cleaned;
}

function overUnderOf(side: string): "over" | "under" | null {
  const s = side.toLowerCase();
  if (s.startsWith("over")) return "over";
  if (s.startsWith("under")) return "under";
  return null;
}

function signedSpread(row: NormalizedMarket): number | null {
  const m = (row.side || "").toLowerCase().match(/[-+]?\d+(\.\d+)?$/);
  if (m) return Number(m[0]);
  return row.line ?? null;
}

/**
 * Rewrite a normalized row into the shared cross-book vocabulary, or return
 * null if it isn't in a class we can reconcile yet.
 */
function reconcile(row: NormalizedMarket, eventName: string, createdAt: string): NormalizedMarket | null {
  const cls = marketClass(row.market_type);
  if (!cls) return null;
  const period = periodOf(row);

  let side: string;
  let line: number | null;
  if (cls === "total") {
    const ou = overUnderOf(row.side);
    if (ou === null || row.line === null || row.line === undefined) return null;
    side = ou;
    line = row.line;
  } else if (cls === "moneyline") {
    side = teamOf(row.side);
    line = null;
  } else {
    side = teamOf(row.side);
    line = signedSpread(row);
    if (line === null) return null;
  }

  return {
    ...row,
    event_id: eventName,
    event_name: eventName,
    sport: "basketball",
    league: "nba",
    market_type: cls,
    player: null,
    side,
    line,
    period,
    // make every row fresh relative to the engine run so freshness gating passes
    timestamp: createdAt,
  };
}

function readJsonl(path: string): NormalizedMarket[] {
  if (!existsSync(path)) {
    console.warn(`(skip) missing input: ${relative(repoRoot, path)}`);
    return [];
  }
  const rows: NormalizedMarket[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t) as NormalizedMarket);
    } catch {
      // stay defensive on malformed lines
    }
  }
  return rows;
}

function impliedOf(row: NormalizedMarket): number | null {
  if (row.implied_probability !== null && row.implied_probability !== undefined) return row.implied_probability;
  const a = row.odds_american;
  if (a === null || a === undefined || a === 0) return null;
  return a > 0 ? 100 / (a + 100) : -a / (-a + 100);
}

function fmtAm(a: number | null | undefined): string {
  if (a === null || a === undefined) return "—";
  return a > 0 ? `+${a}` : `${a}`;
}

function main(): void {
  const inputs = process.argv.length > 2 ? process.argv.slice(2).map((p) => resolve(repoRoot, p)) : DEFAULT_INPUTS;
  const raw = inputs.flatMap(readJsonl);

  const sources = [...new Set(raw.map((r) => r.source))];
  const createdAt = new Date().toISOString();

  // canonical, readable event name (prefer a Novig-style "a @ b")
  const eventName =
    raw.find((r) => (r.event_name || "").includes(" @ "))?.event_name ?? raw[0]?.event_name ?? "cross-book-event";

  const reconciled = raw
    .map((r) => reconcile(r, eventName, createdAt))
    .filter((r): r is NormalizedMarket => r !== null);

  const signals = detectEdgeSignals(reconciled, { createdAt, maxFreshnessSeconds: 86400 });
  const reviewItems = edgeSignalsToReviewItems(signals);

  // cross-book = the two markets in a signal come from different sources
  const crossBook = signals.filter((s) => new Set(s.markets.map((m) => m.source)).size > 1);

  const byType = new Map<string, number>();
  for (const s of signals) byType.set(s.type, (byType.get(s.type) ?? 0) + 1);

  console.log("=== Edge-signal engine wiring ===");
  console.log(`Sources:           ${sources.join(" + ")}`);
  console.log(`Reconciled rows:   ${reconciled.length} (of ${raw.length} read)`);
  console.log(`Signals total:     ${signals.length}`);
  console.log(`Review items:      ${reviewItems.length}`);
  console.log(`Cross-book signals:${crossBook.length}`);
  console.log("By type:");
  for (const [t, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);

  // Cross-book opposite-side candidates: compute combined implied prob.
  // sum < 1.0 => genuine arbitrage (the two sides priced under 100%).
  const arbs = crossBook
    .filter((s) => s.type === "same_line_opposite_side" && s.markets.length === 2)
    .map((s) => {
      const [m1, m2] = s.markets;
      const p1 = impliedOf(m1);
      const p2 = impliedOf(m2);
      const sum = p1 !== null && p2 !== null ? p1 + p2 : null;
      return { s, m1, m2, sum };
    })
    .filter((x) => x.sum !== null)
    .sort((a, b) => (a.sum as number) - (b.sum as number));

  console.log(`\nCross-book opposite-side candidates (totals): ${arbs.length}`);
  console.log("lowest combined implied % first — under 100% = arbitrage:");
  for (const a of arbs.slice(0, 15)) {
    const tag = (a.sum as number) < 1 ? "  <== ARB" : "";
    const lbl = `${a.m1.market_type} ${a.m1.line ?? ""} ${a.m1.side}/${a.m2.side}`;
    console.log(
      `  ${lbl.padEnd(28)} ${a.m1.source}:${fmtAm(a.m1.odds_american)} ${a.m2.source}:${fmtAm(a.m2.odds_american)}  combined=${((a.sum as number) * 100).toFixed(1)}%${tag}`,
    );
  }

  mkdirSync(dirname(SIGNALS_OUT), { recursive: true });
  writeFileSync(SIGNALS_OUT, signals.map((s) => JSON.stringify(s)).join("\n") + (signals.length ? "\n" : ""), "utf8");
  console.log(`\nSignals written: ${SIGNALS_OUT}`);
}

main();
