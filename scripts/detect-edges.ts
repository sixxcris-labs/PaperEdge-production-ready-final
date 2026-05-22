import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
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
const REVIEW_OUT = resolve(repoRoot, "normalized_data", "review_candidates.jsonl");
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
function dedupeKey(row: NormalizedMarket): string {
  return [
    row.source,
    row.sourceEventId ?? row.event_id,
    row.sourceMarketId ?? "",
    row.sourceOutcomeId ?? "",
    row.sport,
    row.league,
    row.event_name,
    row.market_type,
    row.player ?? "",
    row.period,
    row.side,
    row.line ?? "",
    row.odds_american ?? "",
    row.timestamp,
  ].join("|");
}
function dedupeRows(rows: NormalizedMarket[]): NormalizedMarket[] {
  const seen = new Set<string>();
  const out: NormalizedMarket[] = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
function parseArgs(): { inputs: string[]; maxFreshnessSeconds: number } {
  const args = process.argv.slice(2);
  const maxFreshnessArg = args.find((a) => a.startsWith("--max-freshness-seconds="));
  const maxFreshnessSeconds = maxFreshnessArg ? Number(maxFreshnessArg.split("=")[1]) : 86400;
  const fileArgs = args.filter((a) => !a.startsWith("--"));
  return {
    inputs: fileArgs.length > 0 ? fileArgs.map((p) => resolve(repoRoot, p)) : DEFAULT_INPUTS,
    maxFreshnessSeconds: Number.isFinite(maxFreshnessSeconds) && maxFreshnessSeconds > 0 ? maxFreshnessSeconds : 86400,
  };
}

function writeJsonl(path: string, rows: unknown[]): void {
  const fd = openSync(path, "w");
  try {
    for (const row of rows) {
      writeSync(fd, `${JSON.stringify(row)}\n`, undefined, "utf8");
    }
  } finally {
    closeSync(fd);
  }
}

function main(): void {
  const { inputs, maxFreshnessSeconds } = parseArgs();
  const rows = dedupeRows(inputs.flatMap(readJsonl));
  const createdAt = new Date().toISOString();
  const sources = [...new Set(rows.map((r) => r.source))];
  const sports = [...new Set(rows.map((r) => `${r.sport}/${r.league}`))];
  const signals = detectEdgeSignals(rows, { createdAt, maxFreshnessSeconds });
  const reviewItems = edgeSignalsToReviewItems(signals);
  const crossBook = signals.filter((s) => new Set(s.markets.map((m) => m.source)).size > 1);
  const byType = new Map<string, number>();
  const byClassification = new Map<string, number>();
  for (const s of signals) {
    byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
    byClassification.set(s.classification, (byClassification.get(s.classification) ?? 0) + 1);
  }
  console.log("=== PaperEdge edge-signal engine ===");
  console.log(`Inputs:            ${inputs.map((p) => relative(repoRoot, p)).join(", ")}`);
  console.log(`Sources:           ${sources.join(" + ") || "none"}`);
  console.log(`Sports/leagues:    ${sports.join(", ") || "none"}`);
  console.log(`Rows read:          ${rows.length}`);
  console.log(`Signals total:      ${signals.length}`);
  console.log(`Review items:       ${reviewItems.length}`);
  console.log(`Cross-book signals: ${crossBook.length}`);
  console.log("By type:");
  for (const [t, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);
  console.log("By classification:");
  for (const [t, n] of [...byClassification.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);
  const trueArbs = crossBook
    .filter((s) => s.classification === "true_arb_candidate" && s.arbCheck)
    .sort((a, b) => (a.arbCheck?.combinedImplied ?? 99) - (b.arbCheck?.combinedImplied ?? 99));
  const middles = crossBook.filter((s) => s.classification === "middle_candidate");
  console.log(`\nSame-line true arb candidates: ${trueArbs.length}`);
  for (const signal of trueArbs.slice(0, 15)) {
    const [a, b] = signal.markets;
    console.log(
      `  ${a.sport}/${a.league} ${a.event_name} ${a.market_type} ${a.player ?? ""} ${a.line ?? ""} ` +
        `${a.source}:${a.side} ${a.odds_american} vs ${b.source}:${b.side} ${b.odds_american} ` +
        `combined=${((signal.arbCheck?.combinedImplied ?? 0) * 100).toFixed(2)}%`,
    );
  }
  console.log(`Line-split middle candidates: ${middles.length}`);
  mkdirSync(dirname(SIGNALS_OUT), { recursive: true });
  writeJsonl(SIGNALS_OUT, signals);
  writeJsonl(REVIEW_OUT, reviewItems);
  console.log(`\nSignals written: ${SIGNALS_OUT}`);
  console.log(`Review candidates written: ${REVIEW_OUT}`);
}
main();
