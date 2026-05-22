/**
 * Auto-ingest watcher.
 *
 * Watches raw_data/** and, the moment a JSON file is created or changed:
 *   1. detect which book it is,
 *   2. run the matching adapter,
 *   3. schema-validate the normalized rows (fail loudly on bad output),
 *   4. write normalized_data/<book>_normalized.jsonl,
 *   5. run that adapter's vitest file,
 *   6. print a one-line PASS/FAIL summary.
 *
 * Modes:
 *   (default)        watch raw_data/** and process on change
 *   --once           process every existing raw JSON once, then exit
 *   <path> [<path>]  process the given file(s) once, then exit
 *   --no-test        skip the vitest step (normalize + validate only)
 *   --pipeline       after a successful ingest, also refresh detect-edges
 *
 * Run from repo root (WSL — vitest/tsx need the Linux toolchain):
 *   TMPDIR=/tmp npx tsx scripts/watch-ingest.ts
 *   TMPDIR=/tmp npx tsx scripts/watch-ingest.ts --once
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateNormalizedRows } from "../packages/core/src/normalized-market.schema";
import { detectBook, normalizeByBook, toSerializable, type Book } from "./lib/ingest";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const RAW_DIR = resolve(repoRoot, "raw_data");
const OUT_DIR = resolve(repoRoot, "normalized_data");
const VITEST = resolve(repoRoot, "node_modules", "vitest", "vitest.mjs");

const args = process.argv.slice(2);
const RUN_TESTS = !args.includes("--no-test");
const RUN_PIPELINE = args.includes("--pipeline");
const ONCE = args.includes("--once");
const FILE_ARGS = args.filter((a) => !a.startsWith("--"));

function testFileFor(book: Book): string {
  return join("packages", "core", "src", "adapters", `${book}.test.ts`);
}

function log(tag: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${tag} ${msg}`);
}

/** Process one raw JSON file end to end. Returns true on success. */
function ingestFile(filePath: string): boolean {
  const rel = relative(repoRoot, filePath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    log("FAIL", `${rel} — invalid JSON: ${(err as Error).message}`);
    return false;
  }

  const book = detectBook(raw, filePath);
  if (!book) {
    log("SKIP", `${rel} — could not detect book (name it *bovada*/*novig*/*prophet* or check shape)`);
    return false;
  }

  let rows;
  try {
    rows = normalizeByBook(book, raw);
  } catch (err) {
    log("FAIL", `${rel} — ${book} adapter threw: ${(err as Error).message}`);
    return false;
  }

  const serializable = toSerializable(rows);

  // Guard: a real market snapshot always yields priced rows. Files that detect
  // to a book by name but are a non-market endpoint (e.g. Novig fill history) or
  // an empty stub produce 0 priced rows — skip them so they can't clobber a good
  // <book>_normalized.jsonl.
  const priced = serializable.filter((r) => r.odds_american !== null).length;
  if (priced === 0) {
    log("SKIP", `${rel} -> ${book}: 0 priced rows (not a market snapshot) — output left untouched`);
    return false;
  }

  const validation = validateNormalizedRows(serializable);
  if (!validation.valid) {
    log("FAIL", `${rel} — ${book}: ${validation.issues.length} schema issue(s) in ${validation.checked} rows`);
    for (const issue of validation.issues.slice(0, 8)) {
      console.log(`         row ${issue.index}.${issue.field}: ${issue.message}`);
    }
    return false;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${book}_normalized.jsonl`);
  const jsonl = serializable.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(outPath, `${jsonl}\n`, "utf8");

  log("OK", `${rel} -> ${book}: ${serializable.length} rows (${priced} priced) -> ${relative(repoRoot, outPath)}`);

  if (RUN_TESTS) {
    const testFile = testFileFor(book);
    if (existsSync(resolve(repoRoot, testFile))) {
      const res = spawnSync(process.execPath, [VITEST, "run", testFile], { cwd: repoRoot, stdio: "inherit" });
      if (res.status !== 0) {
        log("FAIL", `${book} tests failed (${testFile})`);
        return false;
      }
      log("OK", `${book} tests passed`);
    }
  }

  return true;
}

function refreshPipeline(): void {
  const detect = resolve(repoRoot, "scripts", "detect-edges.ts");
  const tsx = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(detect) || !existsSync(tsx)) return;
  log("RUN", "refreshing detect-edges");
  spawnSync(process.execPath, [tsx, detect], { cwd: repoRoot, stdio: "inherit" });
}

function collectJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsonFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) out.push(full);
  }
  return out;
}

function runOncePass(files: string[]): void {
  let ok = 0;
  let fail = 0;
  for (const f of files) {
    if (ingestFile(f)) ok += 1;
    else fail += 1;
  }
  log("DONE", `processed ${files.length} file(s): ${ok} ok, ${fail} failed/skipped`);
  if (RUN_PIPELINE && ok > 0) refreshPipeline();
  if (fail > 0) process.exitCode = 1;
}

function main(): void {
  if (FILE_ARGS.length > 0) {
    runOncePass(FILE_ARGS.map((f) => resolve(repoRoot, f)));
    return;
  }
  if (ONCE) {
    runOncePass(collectJsonFiles(RAW_DIR));
    return;
  }

  // watch mode
  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });
  log("WATCH", `raw_data/** (tests=${RUN_TESTS}, pipeline=${RUN_PIPELINE}) — Ctrl+C to stop`);

  const debounce = new Map<string, NodeJS.Timeout>();
  watch(RAW_DIR, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const name = filename.toString();
    if (!name.toLowerCase().endsWith(".json")) return;
    const full = join(RAW_DIR, name);

    const prior = debounce.get(full);
    if (prior) clearTimeout(prior);
    debounce.set(
      full,
      setTimeout(() => {
        debounce.delete(full);
        if (!existsSync(full) || !statSync(full).isFile()) return;
        const ok = ingestFile(full);
        if (ok && RUN_PIPELINE) refreshPipeline();
      }, 250),
    );
  });
}

main();
