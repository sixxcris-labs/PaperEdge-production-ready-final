/**
 * Ingestion driver for the existing Novig adapter.
 *
 * This script does NOT contain normalization logic. It only:
 *   1. reads a captured Novig JSON file,
 *   2. passes it to the existing `normalizeNovigMarkets()` adapter, and
 *   3. writes the resulting NormalizedMarket rows out as JSONL + a summary.
 *
 * All field mapping, price/odds conversion, market-type and period handling
 * live in packages/core/src/adapters/novig.ts and are reused unchanged.
 *
 * Run from repo root:
 *   npx tsx scripts/normalize-novig.ts                     # uses the default input
 *   npx tsx scripts/normalize-novig.ts raw_data/your_file.json
 *
 * The first CLI argument, if given, is the input JSON path (absolute, or
 * relative to the repo root). It defaults to raw_data/novig2.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeNovigMarkets } from "../packages/core/src/adapters/novig";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const DEFAULT_INPUT = resolve(repoRoot, "raw_data", "novig2.json");

const inputArg = process.argv[2];
const INPUT_PATH = inputArg ? resolve(repoRoot, inputArg) : DEFAULT_INPUT;
const OUTPUT_PATH = resolve(repoRoot, "normalized_data", "novig_normalized.jsonl");

function loadRaw(path: string): unknown {
  if (!existsSync(path)) {
    console.error(`Input file not found: ${path}`);
    console.error("Save the captured Novig JSON there and re-run.");
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
  const rows = normalizeNovigMarkets(raw);

  // Drop the per-row `raw` context for the JSONL artifact (keeps it flat/small,
  // matching the Bovada output).
  const serializable = rows.map(({ raw: _raw, ...rest }) => rest);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const jsonl = serializable.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(OUTPUT_PATH, serializable.length > 0 ? `${jsonl}\n` : "", "utf8");

  const eventCount = new Set(rows.map((r) => r.sourceEventId ?? r.event_id)).size;
  const marketCount = new Set(
    rows.map((r) => `${r.sourceEventId ?? r.event_id}::${r.sourceMarketId ?? ""}`),
  ).size;
  const priced = serializable.filter((r) => r.odds_american !== null).length;

  console.log("=== Novig normalization summary ===");
  console.log(`Input:            ${INPUT_PATH}`);
  console.log(`Output:           ${OUTPUT_PATH}`);
  console.log(`Events parsed:    ${eventCount}`);
  console.log(`Markets parsed:   ${marketCount}`);
  console.log(`Rows written:     ${serializable.length}`);
  console.log(`Rows with odds:   ${priced}`);
  console.log("First 5 normalized rows:");
  console.log(JSON.stringify(serializable.slice(0, 5), null, 2));
}

main();
