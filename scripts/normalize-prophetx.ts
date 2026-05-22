/**
 * Ingestion driver for the existing ProphetX adapter.
 *
 * Run from repo root:
 *   npx tsx scripts/normalize-prophetx.ts                     # default input
 *   npx tsx scripts/normalize-prophetx.ts raw_data/your_file.json
 *
 * Default input is raw_data/prophetx.json because it contains complete event+
 * market+selection depth. prophetx2.json is lighter metadata.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeProphetXMarkets } from "../packages/core/src/adapters/prophetx";
import { resolveLatestJsonInput } from "./lib/latest-json-input";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const DEFAULT_INPUT = resolveLatestJsonInput({
  repoRoot,
  bookDirName: "prophetx",
  fallbackFileName: "prophetx.json",
});

const inputArg = process.argv[2];
const INPUT_PATH = inputArg ? resolve(repoRoot, inputArg) : DEFAULT_INPUT;
const OUTPUT_PATH = resolve(repoRoot, "normalized_data", "prophetx_normalized.jsonl");

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
  const rows = normalizeProphetXMarkets(raw);
  const serializable = rows.map(({ raw: _raw, ...rest }) => rest);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const jsonl = serializable.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(OUTPUT_PATH, serializable.length > 0 ? `${jsonl}\n` : "", "utf8");

  const eventCount = new Set(rows.map((r) => r.sourceEventId ?? r.event_id)).size;
  const marketCount = new Set(
    rows.map((r) => `${r.sourceEventId ?? r.event_id}::${r.sourceMarketId ?? ""}`),
  ).size;

  console.log("=== ProphetX normalization summary ===");
  console.log(`Input:            ${INPUT_PATH}`);
  console.log(`Output:           ${OUTPUT_PATH}`);
  console.log(`Events parsed:    ${eventCount}`);
  console.log(`Markets parsed:   ${marketCount}`);
  console.log(`Rows written:     ${serializable.length}`);
  console.log("First 5 normalized rows:");
  console.log(JSON.stringify(serializable.slice(0, 5), null, 2));
}

main();
