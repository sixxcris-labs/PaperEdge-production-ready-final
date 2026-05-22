/**
 * Fair-value (+EV vs no-vig consensus) report.
 *
 * Reads the normalized JSONL for each book, builds cross-book quotes with
 * correct market keying, and runs the core `findValueEdges()` to surface
 * outcomes priced better than the leave-one-out consensus of the other books.
 *
 * IMPORTANT keying detail: a spread's two opposite markets (e.g. home -9.5 and
 * home +9.5) must NOT be merged. We express every spread line from the HOME
 * team's perspective so each 2-outcome market is distinct and de-viggable.
 * Home team is derived from event_name ("away @ home").
 *
 * Run from repo root (WSL):
 *   TMPDIR=/tmp npx tsx scripts/fair-value-report.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NormalizedMarket } from "../packages/core/src/market-normalization";
import { findValueEdges, type BookQuote } from "../packages/core/src/fair-value";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"];
const DEFAULT_INPUTS = BOOKS.map((b) => resolve(repoRoot, "normalized_data", `${b}_normalized.jsonl`));
const CSV_OUT = resolve(repoRoot, "normalized_data", "fair_value_edges.csv");

const TEAM_ALIASES: Record<string, string> = {
  "oklahoma city thunder": "okc",
  okc: "okc",
  thunder: "okc",
  "san antonio spurs": "sas",
  sas: "sas",
  sa: "sas",
  spurs: "sas",
};

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

function signedSpread(row: NormalizedMarket): number | null {
  const m = (row.side || "").toLowerCase().match(/[-+]?\d+(\.\d+)?$/);
  if (m) return Number(m[0]);
  return row.line ?? null;
}

function overUnder(side: string): "over" | "under" | null {
  const s = side.toLowerCase();
  if (s.startsWith("over")) return "over";
  if (s.startsWith("under")) return "under";
  return null;
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
      /* skip */
    }
  }
  return rows;
}

function homeTeam(rows: NormalizedMarket[]): string | null {
  const named = rows.find((r) => (r.event_name || "").includes(" @ "));
  if (!named) return null;
  const home = named.event_name.split(" @ ")[1];
  return home ? teamOf(home) : null;
}

function toQuotes(rows: NormalizedMarket[], home: string | null): BookQuote[] {
  const quotes: BookQuote[] = [];
  for (const row of rows) {
    const implied = row.implied_probability;
    if (implied === null || implied === undefined || !(implied > 0 && implied < 1)) continue;
    const cls = marketClass(row.market_type);
    if (!cls) continue;
    const period = periodOf(row);

    let market: string;
    let outcome: string;
    if (cls === "moneyline") {
      market = `ml|${period}`;
      outcome = teamOf(row.side);
    } else if (cls === "total") {
      const ou = overUnder(row.side);
      if (!ou || row.line === null || row.line === undefined) continue;
      market = `total|${period}|${row.line}`;
      outcome = ou;
    } else {
      const team = teamOf(row.side);
      const signed = signedSpread(row);
      if (signed === null) continue;
      // express the line from the home team's perspective so opposite markets stay distinct
      const homeLine = home && team === home ? signed : home ? -signed : signed;
      market = `spread|${period}|${homeLine}`;
      outcome = team;
    }
    quotes.push({ source: row.source, market, outcome, impliedProbability: implied });
  }
  return quotes;
}

function main(): void {
  const inputs = process.argv.length > 2 ? process.argv.slice(2).map((p) => resolve(repoRoot, p)) : DEFAULT_INPUTS;
  const rows = inputs.flatMap(readJsonl);
  const sources = [...new Set(rows.map((r) => r.source))];
  const home = homeTeam(rows);

  const quotes = toQuotes(rows, home);
  const edges = findValueEdges(quotes, { minEdge: 0 });
  const positive = edges.filter((e) => e.edge > 0);

  console.log("=== Fair-value (+EV vs no-vig consensus) ===");
  console.log(`Sources:        ${sources.join(" + ")}`);
  console.log(`Home team:      ${home ?? "(unknown — spread keying may be imperfect)"}`);
  console.log(`Quotes:         ${quotes.length}`);
  console.log(`+EV outcomes:   ${positive.length}`);
  console.log("");
  const head = "book".padEnd(10) + "market".padEnd(24) + "outcome".padEnd(8) + "offered  fair    edge   refs";
  console.log(head);
  console.log("-".repeat(head.length));
  for (const e of positive.slice(0, 25)) {
    console.log(
      e.source.padEnd(10) +
        e.market.padEnd(24) +
        e.outcome.padEnd(8) +
        `${(e.offeredProbability * 100).toFixed(1)}%  ` +
        `${(e.fairProbability * 100).toFixed(1)}%  ` +
        `+${(e.edge * 100).toFixed(1)}%  ` +
        `${e.referenceBooks}`,
    );
  }

  mkdirSync(dirname(CSV_OUT), { recursive: true });
  const csv = [
    "book,market,outcome,offered_prob,fair_prob,edge,reference_books",
    ...edges.map(
      (e) =>
        `${e.source},${e.market},${e.outcome},${e.offeredProbability.toFixed(4)},${e.fairProbability.toFixed(4)},${e.edge.toFixed(4)},${e.referenceBooks}`,
    ),
  ].join("\n");
  writeFileSync(CSV_OUT, `${csv}\n`, "utf8");
  console.log(`\nCSV written: ${CSV_OUT}`);
}

main();
