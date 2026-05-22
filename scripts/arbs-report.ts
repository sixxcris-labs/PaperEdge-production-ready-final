import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedMarket } from "../packages/core/src/market-normalization";
import { assessMarketRelationship, impliedFromAmerican, marketComparisonKey } from "../packages/core/src/market-normalization";
import { rateArb } from "../packages/core/src/scan-findings";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"];
const DEFAULT_INPUTS = BOOKS.map((b) => resolve(repoRoot, "normalized_data", `${b}_normalized.jsonl`));
const CSV_OUT = resolve(repoRoot, "normalized_data", "cross_book_arbs.csv");
type PairReport = {
  classification: "true_arb_candidate" | "not_arb" | "middle_candidate" | "reject";
  event: string;
  sport: string;
  league: string;
  market: string;
  player: string;
  period: string;
  lineA: number | null;
  sideA: string;
  bookA: string;
  oddsA: number;
  lineB: number | null;
  sideB: string;
  bookB: string;
  oddsB: number;
  liquidityA: number | null;
  liquidityB: number | null;
  combinedImplied: number | null;
  reason: string;
};
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
    }
  }
  return rows;
}
function usableOdds(row: NormalizedMarket): row is NormalizedMarket & { odds_american: number } {
  return typeof row.odds_american === "number" && Number.isFinite(row.odds_american) && row.odds_american !== 0;
}
function fmtAm(a: number): string {
  return a > 0 ? `+${a}` : `${a}`;
}
function pairKey(a: NormalizedMarket, b: NormalizedMarket): string {
  return [
    marketComparisonKey(a),
    a.line ?? "",
    b.line ?? "",
    a.source,
    b.source,
    a.side,
    b.side,
    a.odds_american ?? "",
    b.odds_american ?? "",
  ].join("|");
}
function quoteReport(a: NormalizedMarket & { odds_american: number }, b: NormalizedMarket & { odds_american: number }): PairReport {
  const relationship = assessMarketRelationship(a, b);
  const combinedImplied = impliedFromAmerican(a.odds_american) + impliedFromAmerican(b.odds_american);
  let classification: PairReport["classification"] = "reject";
  if (relationship.kind === "same_line_opposite_side") classification = combinedImplied < 1 ? "true_arb_candidate" : "not_arb";
  if (relationship.kind === "middle_line_split") classification = "middle_candidate";
  return {
    classification,
    event: a.event_name,
    sport: a.sport,
    league: a.league,
    market: a.market_type,
    player: a.player ?? "",
    period: a.period,
    lineA: a.line ?? null,
    sideA: a.side,
    bookA: a.source,
    oddsA: a.odds_american,
    lineB: b.line ?? null,
    sideB: b.side,
    bookB: b.source,
    oddsB: b.odds_american,
    liquidityA: typeof a.liquidity === "number" && Number.isFinite(a.liquidity) ? a.liquidity : null,
    liquidityB: typeof b.liquidity === "number" && Number.isFinite(b.liquidity) ? b.liquidity : null,
    combinedImplied: relationship.kind === "same_line_opposite_side" ? combinedImplied : null,
    reason: relationship.reason,
  };
}
function main(): void {
  const maxArg = process.argv.find((a) => a.startsWith("--max="));
  const maxCombined = maxArg ? Number(maxArg.split("=")[1]) : Number.POSITIVE_INFINITY;
  const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const inputs = fileArgs.length > 0 ? fileArgs.map((p) => resolve(repoRoot, p)) : DEFAULT_INPUTS;
  const rows = inputs.flatMap(readJsonl).filter(usableOdds);
  const reports: PairReport[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (marketComparisonKey(a) !== marketComparisonKey(b)) continue;
      const relationship = assessMarketRelationship(a, b);
      if (relationship.kind !== "same_line_opposite_side" && relationship.kind !== "middle_line_split") continue;
      const key = pairKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      reports.push(quoteReport(a, b));
    }
  }
  // Rate every pair with the KB logic, then rank best → worst by that score
  // (so the console and CSV both lead with the strongest, executable plays).
  const rated = reports.map((o) => ({
    o,
    rating: rateArb({
      classification: o.classification,
      combinedImplied: o.combinedImplied,
      bookA: o.bookA,
      bookB: o.bookB,
      liquidityA: o.liquidityA,
      liquidityB: o.liquidityB,
    }),
  }));
  rated.sort(
    (x, y) => y.rating.score - x.rating.score || (x.o.combinedImplied ?? 99) - (y.o.combinedImplied ?? 99),
  );
  const arbs = reports.filter((o) => o.classification === "true_arb_candidate");
  const middles = reports.filter((o) => o.classification === "middle_candidate");
  const shown = rated.filter(({ o }) => o.combinedImplied === null || o.combinedImplied <= maxCombined);
  console.log("=== Cross-book same-market arb/middle report (KB-rated) ===");
  console.log(`Books:        ${[...new Set(rows.map((r) => r.source))].join(", ")}`);
  console.log(`Pairs checked: ${reports.length}   True arb candidates: ${arbs.length}   Middles: ${middles.length}`);
  console.log("Combined implied is recomputed from odds_american. ROE/grade follow the OddsFlex KB (1–3% typical, >5% suspect).");
  console.log("");
  const head =
    "grade".padEnd(6) + "roe".padEnd(9) + "type".padEnd(11) + "market".padEnd(22) + "sideA".padEnd(18) + "sideB".padEnd(18) + "maxbet";
  console.log(head);
  console.log("-".repeat(head.length));
  for (const { o, rating } of shown.slice(0, 80)) {
    const aStr = `${o.sideA}${o.lineA === null ? "" : " " + o.lineA} ${fmtAm(o.oddsA)}@${o.bookA}`;
    const bStr = `${o.sideB}${o.lineB === null ? "" : " " + o.lineB} ${fmtAm(o.oddsB)}@${o.bookB}`;
    const roe = rating.roe === null ? (o.combinedImplied === null ? "middle" : "—") : `${(rating.roe * 100).toFixed(2)}%`;
    const maxbet = rating.maxStake === null ? "?" : `$${Math.floor(rating.maxStake).toLocaleString()}`;
    const market = `${o.market}${o.player ? " " + o.player : ""}`;
    console.log(
      rating.grade.padEnd(6) + roe.padEnd(9) + rating.tradeType.padEnd(11) + market.slice(0, 21).padEnd(22) + aStr.padEnd(18) + bStr.padEnd(18) + maxbet,
    );
  }
  mkdirSync(dirname(CSV_OUT), { recursive: true });
  const csv = [
    "classification,sport,league,event,market,player,period,side_a,line_a,book_a,odds_a,side_b,line_b,book_b,odds_b,combined_implied,reason,liq_a,liq_b,roe,hold_pct,max_stake,trade_type,rating,score,flags",
    ...rated.map(({ o, rating }) => {
      return [
        o.classification,
        o.sport,
        o.league,
        o.event,
        o.market,
        o.player,
        o.period,
        o.sideA,
        o.lineA ?? "",
        o.bookA,
        o.oddsA,
        o.sideB,
        o.lineB ?? "",
        o.bookB,
        o.oddsB,
        o.combinedImplied === null ? "" : o.combinedImplied.toFixed(6),
        o.reason,
        o.liquidityA ?? "",
        o.liquidityB ?? "",
        rating.roe === null ? "" : rating.roe.toFixed(6),
        rating.holdPct === null ? "" : rating.holdPct.toFixed(6),
        rating.maxStake ?? "",
        rating.tradeType,
        rating.grade,
        rating.score,
        rating.flags.join("|"),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",");
    }),
  ].join("\n");
  writeFileSync(CSV_OUT, `${csv}\n`, "utf8");
  console.log(`\n${reports.length} evaluated pairs, ${arbs.length} true arb candidates. Full list: ${CSV_OUT}`);
}
main();
