import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeBovadaMarkets, type BovadaNormalizeOptions } from "../packages/core/src/adapters/bovada";
import { resolveLatestJsonInput } from "./lib/latest-json-input";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const DEFAULT_INPUT = resolveLatestJsonInput({
  repoRoot,
  bookDirName: "bovada",
  fallbackFileName: "bovada_okc_spurs_event.json",
});
const OUTPUT_PATH = resolve(repoRoot, "normalized_data", "bovada_normalized.jsonl");
function valueArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
function inputPath(): string {
  const positional = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  return positional ? resolve(repoRoot, positional) : DEFAULT_INPUT;
}
function loadRaw(path: string): unknown {
  if (!existsSync(path)) {
    console.error(`Input file not found: ${path}`);
    console.error("Save the captured Bovada JSON there or pass a path explicitly.");
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
    console.error(`Invalid JSON in ${path}: ${(err as Error).message}`);
    process.exit(1);
  }
}
function main(): void {
  const input = inputPath();
  const options: BovadaNormalizeOptions = {
    sport: valueArg("sport"),
    league: valueArg("league"),
    receivedAt: valueArg("received-at"),
  };
  const raw = loadRaw(input);
  const rows = normalizeBovadaMarkets(raw, options);
  const serializable = rows.map(({ raw: _raw, ...rest }) => rest);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const jsonl = serializable.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(OUTPUT_PATH, serializable.length > 0 ? `${jsonl}\n` : "", "utf8");
  const eventCount = new Set(rows.map((r) => r.sourceEventId ?? r.event_id)).size;
  const marketCount = new Set(rows.map((r) => `${r.sourceEventId ?? r.event_id}::${r.sourceMarketId ?? ""}`)).size;
  const priced = serializable.filter((r) => r.odds_american !== null).length;
  console.log("=== Bovada normalization summary ===");
  console.log(`Input:            ${input}`);
  console.log(`Output:           ${OUTPUT_PATH}`);
  console.log(`Events parsed:    ${eventCount}`);
  console.log(`Markets parsed:   ${marketCount}`);
  console.log(`Rows written:     ${serializable.length}`);
  console.log(`Rows with odds:   ${priced}`);
  console.log("First 5 normalized rows:");
  console.log(JSON.stringify(serializable.slice(0, 5), null, 2));
}
main();
