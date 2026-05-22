/**
 * Ingestion driver for the existing Bovada adapter.
 *
 * This script does NOT contain any normalization logic. It only:
 *   1. reads a captured Bovada JSON file,
 *   2. passes it to the existing `normalizeBovadaMarkets()` adapter, and
 *   3. writes the resulting NormalizedMarket rows out as JSONL + a summary.
 *
 * All field mapping, odds parsing, status mapping, and period handling live in
 * packages/core/src/adapters/bovada.ts and are reused unchanged.
 *
 * Run from repo root:
 *   npx tsx scripts/normalize-bovada.ts                       # uses the default input
 *   npx tsx scripts/normalize-bovada.ts raw_data/your_file.json
 *
 * The first CLI argument, if given, is the input JSON path (absolute, or
 * relative to the repo root). It defaults to raw_data/bovada_okc_spurs_event.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeBovadaMarkets } from "../packages/core/src/adapters/bovada";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const DEFAULT_INPUT = resolve(repoRoot, "raw_data", "bovada_okc_spurs_event.json");

const inputArg = process.argv[2];
const INPUT_PATH = inputArg ? resolve(repoRoot, inputArg) : DEFAULT_INPUT;
const OUTPUT_PATH = resolve(repoRoot, "normalized_data", "bovada_normalized.jsonl");

function loadRaw(path: string): unknown {
  if (!existsSync(path)) {
    console.error(`Input file not found: ${path}`);
    console.error("Save the captured Bovada JSON there and re-run.");
    process.exit(1);
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    console.error(`Could not read input file: ${(err as Error).message}`);
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`Input file is not valid JSON: ${(err as Error).message}`);
    process.exit(1);
  }
}

function main(): void {
  const raw = loadRaw(INPUT_PATH);

  // All normalization is delegated to the existing adapter.
  const rows = normalizeBovadaMarkets(raw, { sport: "basketball", league: "nba" });

  // The adapter attaches the full event/market/outcome context on each row's
  // `raw` field. For the JSONL ingestion artifact we drop it: every row would
  // otherwise embed a complete copy of the source event, which both bloats the
  // file quadratically and overflows JS's max string length on large inputs.
  // This also matches the flat normalized schema (no `raw` field).
  const serializable = rows.map(({ raw: _raw, ...rest }) => rest);

  // Write JSONL (one normalized row per line, UTF-8).
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const jsonl = serializable.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(OUTPUT_PATH, serializable.length > 0 ? `${jsonl}\n` : "", "utf8");

  // Counts derived from the normalized rows (no re-walking of raw structure).
  const eventCount = new Set(rows.map((r) => r.sourceEventId ?? r.event_id)).size;
  const marketCount = new Set(
    rows.map((r) => `${r.sourceEventId ?? r.event_id}::${r.sourceMarketId ?? ""}`),
  ).size;

  console.log("=== Bovada normalization summary ===");
  console.log(`Input:            ${INPUT_PATH}`);
  console.log(`Output:           ${OUTPUT_PATH}`);
  console.log(`Events parsed:    ${eventCount}`);
  console.log(`Markets parsed:   ${marketCount}`);
  console.log(`Rows written:     ${serializable.length}`);
  console.log("First 5 normalized rows:");
  console.log(JSON.stringify(serializable.slice(0, 5), null, 2));
}

main();
