/**
 * Cross-book arbitrage / best-price report.
 *
 * For every two-way market (moneyline, spread, total) it takes the BEST price
 * available for each side across all books, then checks whether backing both
 * best sides locks in a profit:
 *   combined = bestImplied(sideA) + bestImplied(sideB)
 *   combined < 1.0  =>  arbitrage; ROI = 1/combined - 1
 *
 * One row per market (not per book-pair), ranked by combined implied %.
 * This is the "give me the arbs" view; for +EV-vs-consensus value use
 * fair-value-report.ts instead.
 *
 * Run from repo root (WSL):
 *   TMPDIR=/tmp npx tsx scripts/arbs-report.ts                 # all 5 books
 *   TMPDIR=/tmp npx tsx scripts/arbs-report.ts --max=1.02      # only combined <= 102%
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NormalizedMarket } from "../packages/core/src/market-normalization";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"];
const DEFAULT_INPUTS = BOOKS.map((b) => resolve(repoRoot, "normalized_data", `${b}_normalized.jsonl`));
const CSV_OUT = resolve(repoRoot, "normalized_data", "cross_book_arbs.csv");

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
  return m ? Number(m[0]) : (row.line ?? null);
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

type Quote = { source: string; american: number; implied: number };

function fmtAm(a: number): string {
  return a > 0 ? `+${a}` : `${a}`;
}

function main(): void {
  const maxArg = process.argv.find((a) => a.startsWith("--max="));
  const maxCombined = maxArg ? Number(maxArg.split("=")[1]) : Number.POSITIVE_INFINITY;
  const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const inputs = fileArgs.length > 0 ? fileArgs.map((p) => resolve(repoRoot, p)) : DEFAULT_INPUTS;

  const rows = inputs.flatMap(readJsonl);
  const home = homeTeam(rows);

  // market -> outcome -> { best quote, rows-per-source }
  // perSource counts let us drop ambiguous markets: if one book lists the same
  // side more than once at the same key, distinct markets were collapsed
  // (e.g. rebet labels team/quarter/derivative totals all as "total") and we
  // can't trust which over pairs with which under.
  type Cell = { best: Quote; perSource: Map<string, number> };
  const markets = new Map<string, Map<string, Cell>>();
  const labels = new Map<string, string>(); // market -> human label
  for (const row of rows) {
    const implied = row.implied_probability;
    const american = row.odds_american;
    if (implied === null || implied === undefined || !(implied > 0 && implied < 1)) continue;
    if (american === null || american === undefined) continue;

    const cls = marketClass(row.market_type);
    if (!cls) continue;
    const period = periodOf(row);

    let market: string;
    let outcome: string;
    let label: string;
    if (cls === "moneyline") {
      outcome = teamOf(row.side);
      market = `ml|${period}`;
      label = `moneyline${period === "full_game" ? "" : " " + period}`;
    } else if (cls === "total") {
      const ou = overUnder(row.side);
      if (!ou || row.line === null || row.line === undefined) continue;
      outcome = ou;
      market = `total|${period}|${row.line}`;
      label = `total ${row.line}`;
    } else {
      const team = teamOf(row.side);
      const signed = signedSpread(row);
      if (signed === null) continue;
      const homeLine = home && team === home ? signed : home ? -signed : signed;
      outcome = team;
      market = `spread|${period}|${homeLine}`;
      label = `spread ${homeLine > 0 ? "+" : ""}${homeLine}`;
    }

    labels.set(market, label);
    const byOutcome = markets.get(market) ?? new Map<string, Cell>();
    let cell = byOutcome.get(outcome);
    if (!cell) {
      cell = { best: { source: row.source, american, implied }, perSource: new Map() };
      byOutcome.set(outcome, cell);
    }
    cell.perSource.set(row.source, (cell.perSource.get(row.source) ?? 0) + 1);
    if (implied < cell.best.implied) cell.best = { source: row.source, american, implied };
    markets.set(market, byOutcome);
  }

  type Opp = {
    market: string;
    label: string;
    sideA: string;
    sideB: string;
    a: Quote;
    b: Quote;
    combined: number;
  };
  const opps: Opp[] = [];
  let ambiguous = 0;
  for (const [market, byOutcome] of markets) {
    if (byOutcome.size !== 2) continue; // clean two-way only
    const cells = [...byOutcome.values()];
    // skip if any book contributed more than one row to a side (collapsed markets)
    if (cells.some((c) => [...c.perSource.values()].some((n) => n > 1))) {
      ambiguous += 1;
      continue;
    }
    const [sideA, sideB] = [...byOutcome.keys()];
    const a = byOutcome.get(sideA)!.best;
    const b = byOutcome.get(sideB)!.best;
    opps.push({ market, label: labels.get(market) ?? market, sideA, sideB, a, b, combined: a.implied + b.implied });
  }
  opps.sort((x, y) => x.combined - y.combined);

  const arbs = opps.filter((o) => o.combined < 1);
  const shown = opps.filter((o) => o.combined <= maxCombined);

  console.log("=== Cross-book best-price / arbitrage report ===");
  console.log(`Books:        ${[...new Set(rows.map((r) => r.source))].join(", ")}`);
  console.log(`Two-way markets: ${opps.length}   Arbitrage (<100%): ${arbs.length}   Skipped (ambiguous/under-labeled): ${ambiguous}`);
  console.log("");
  const head =
    "market".padEnd(20) + "sideA (best book)".padEnd(22) + "sideB (best book)".padEnd(22) + "combined  ROI";
  console.log(head);
  console.log("-".repeat(head.length));
  for (const o of shown.slice(0, 60)) {
    const aStr = `${o.sideA} ${fmtAm(o.a.american)}@${o.a.source}`;
    const bStr = `${o.sideB} ${fmtAm(o.b.american)}@${o.b.source}`;
    const roi = o.combined < 1 ? `+${((1 / o.combined - 1) * 100).toFixed(1)}%` : "—";
    const tag = o.combined < 1 ? "  <== ARB" : "";
    console.log(o.label.padEnd(20) + aStr.padEnd(22) + bStr.padEnd(22) + `${(o.combined * 100).toFixed(1)}%`.padEnd(9) + roi + tag);
  }

  mkdirSync(dirname(CSV_OUT), { recursive: true });
  const csv = [
    "market,side_a,book_a,odds_a,side_b,book_b,odds_b,combined_implied,roi_pct,is_arb",
    ...opps.map((o) => {
      const roi = o.combined < 1 ? ((1 / o.combined - 1) * 100).toFixed(2) : "";
      return `${o.label},${o.sideA},${o.a.source},${o.a.american},${o.sideB},${o.b.source},${o.b.american},${o.combined.toFixed(4)},${roi},${o.combined < 1}`;
    }),
  ].join("\n");
  writeFileSync(CSV_OUT, `${csv}\n`, "utf8");
  console.log(`\n${opps.length} markets, ${arbs.length} arbs. Full ranked list: ${CSV_OUT}`);
}

main();
