import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedMarket } from "../packages/core/src/market-normalization";
import { impliedFromAmerican, normalizeSide, strictMarketComparisonKey } from "../packages/core/src/market-normalization";
import { findValueEdges, type BookQuote } from "../packages/core/src/fair-value";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"];
const DEFAULT_INPUTS = BOOKS.map((b) => resolve(repoRoot, "normalized_data", `${b}_normalized.jsonl`));
const CSV_OUT = resolve(repoRoot, "normalized_data", "fair_value_edges.csv");
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
function toQuotes(rows: NormalizedMarket[]): BookQuote[] {
  const quotes: BookQuote[] = [];
  for (const row of rows) {
    const american = row.odds_american;
    if (american === null || american === undefined || american === 0) continue;
    const implied = impliedFromAmerican(american);
    if (!(implied > 0 && implied < 1)) continue;
    quotes.push({
      source: row.source,
      market: strictMarketComparisonKey(row),
      outcome: normalizeSide(row.side) || row.side,
      impliedProbability: implied,
    });
  }
  return quotes;
}
function main(): void {
  const inputs = process.argv.length > 2 ? process.argv.slice(2).map((p) => resolve(repoRoot, p)) : DEFAULT_INPUTS;
  const rows = inputs.flatMap(readJsonl);
  const sources = [...new Set(rows.map((r) => r.source))];
  const quotes = toQuotes(rows);
  const edges = findValueEdges(quotes, { minEdge: 0 });
  const positive = edges.filter((e) => e.edge > 0);
  console.log("=== Fair-value (+EV vs no-vig consensus) ===");
  console.log(`Sources:        ${sources.join(" + ")}`);
  console.log(`Quotes:         ${quotes.length}`);
  console.log(`+EV outcomes:   ${positive.length}`);
  console.log("Imported implied_probability is ignored; fair-value inputs use odds_american.");
  console.log("");
  const head = "book".padEnd(10) + "market".padEnd(48) + "outcome".padEnd(14) + "offered  fair    edge   refs";
  console.log(head);
  console.log("-".repeat(head.length));
  for (const e of positive.slice(0, 25)) {
    console.log(
      e.source.padEnd(10) +
        e.market.slice(0, 47).padEnd(48) +
        e.outcome.slice(0, 13).padEnd(14) +
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
        `"${e.source}","${e.market.replace(/"/g, '""')}","${e.outcome.replace(/"/g, '""')}",${e.offeredProbability.toFixed(4)},${e.fairProbability.toFixed(4)},${e.edge.toFixed(4)},${e.referenceBooks}`,
    ),
  ].join("\n");
  writeFileSync(CSV_OUT, `${csv}\n`, "utf8");
  console.log(`\nCSV written: ${CSV_OUT}`);
}
main();
