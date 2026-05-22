/**
 * Ingestion driver for Rebet captured event market JSON.
 *
 * Run from repo root:
 *   npx tsx scripts/normalize-rebet.ts                     # default input
 *   npx tsx scripts/normalize-rebet.ts raw_data/your_file.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRebetMarkets } from "../packages/core/src/adapters/rebet";
import { resolveLatestJsonInput } from "./lib/latest-json-input";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const DEFAULT_INPUT = resolveLatestJsonInput({
  repoRoot,
  bookDirName: "rebet",
  fallbackFileName: "rebet.json",
});

const inputArg = process.argv[2];
const INPUT_PATH = inputArg ? resolve(repoRoot, inputArg) : DEFAULT_INPUT;
const OUTPUT_PATH = resolve(repoRoot, "normalized_data", "rebet_normalized.jsonl");

function loadRaw(path: string): unknown {
  if (!existsSync(path)) {
    console.error(`Input file not found: ${path}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`Failed to read/parse JSON: ${(err as Error).message}`);
    process.exit(1);
  }
}

function main(): void {
  const raw = loadRaw(INPUT_PATH);
  const rows = normalizeRebetMarkets(raw);
  const serializable = rows.map(({ raw: _raw, ...rest }) => rest);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const jsonl = serializable.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(OUTPUT_PATH, serializable.length > 0 ? `${jsonl}\n` : "", "utf8");

  const eventCount = new Set(rows.map((r) => r.sourceEventId ?? r.event_id)).size;
  const marketCount = new Set(
    rows.map((r) => `${r.sourceEventId ?? r.event_id}::${r.sourceMarketId ?? ""}`),
  ).size;

  console.log("=== Rebet normalization summary ===");
  console.log(`Input:            ${INPUT_PATH}`);
  console.log(`Output:           ${OUTPUT_PATH}`);
  console.log(`Events parsed:    ${eventCount}`);
  console.log(`Markets parsed:   ${marketCount}`);
  console.log(`Rows written:     ${serializable.length}`);
  console.log("First 5 normalized rows:");
  console.log(JSON.stringify(serializable.slice(0, 5), null, 2));
}

main();
