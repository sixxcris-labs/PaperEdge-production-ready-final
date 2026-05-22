import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedMarket } from "../packages/core/src/market-normalization";
import { impliedFromAmerican, strictMarketComparisonKey } from "../packages/core/src/market-normalization";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"];
const DEFAULT_INPUTS = BOOKS.map((b) => resolve(repoRoot, "normalized_data", `${b}_normalized.jsonl`));
const CSV_OUT = resolve(repoRoot, "normalized_data", "book_comparison.csv");
function impliedOf(row: NormalizedMarket): number | null {
  if (typeof row.odds_american !== "number" || !Number.isFinite(row.odds_american) || row.odds_american === 0) return null;
  return impliedFromAmerican(row.odds_american);
}
function selectionKey(row: NormalizedMarket): string {
  return `${strictMarketComparisonKey(row)}|${row.side}`;
}
function readJsonl(path: string): NormalizedMarket[] {
  if (!existsSync(path)) {
    console.warn(`(skip) missing input: ${relative(repoRoot, path)}`);
    return [];
  }
  const out: NormalizedMarket[] = [];
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as NormalizedMarket);
    } catch {
    }
  }
  return out;
}
function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}
function fmtAm(a: number | null): string {
  if (a === null) return "—";
  return a > 0 ? `+${a}` : `${a}`;
}
function main(): void {
  const inputs: string[] = process.argv.length > 2 ? process.argv.slice(2).map((p: string) => resolve(repoRoot, p)) : DEFAULT_INPUTS;
  const rows: NormalizedMarket[] = inputs.flatMap(readJsonl);
  const seen: string[] = Array.from(new Set<string>(rows.map((r) => String(r.source))));
  const books: string[] = [...BOOKS.filter((b) => seen.includes(b)), ...seen.filter((s) => !BOOKS.includes(s))];
  if (books.length < 2) {
    console.error(`Need at least 2 books with data to compare; found: [${seen.join(", ")}]`);
    process.exit(1);
  }
  const indexed = new Map<string, Record<string, { am: number | null; implied: number }>>();
  for (const row of rows) {
    const implied = impliedOf(row);
    if (implied === null) continue;
    const key = selectionKey(row);
    const bucket = indexed.get(key) ?? {};
    const existing = bucket[row.source];
    if (!existing || implied < existing.implied) bucket[row.source] = { am: row.odds_american ?? null, implied };
    indexed.set(key, bucket);
  }
  type Matched = {
    key: string;
    quotes: Record<string, { am: number | null; implied: number }>;
    bookCount: number;
    bestBook: string;
    gap: number;
  };
  const matched: Matched[] = [];
  for (const [key, bucket] of indexed) {
    const present = Object.keys(bucket);
    if (present.length < 2) continue;
    let bestBook = present[0];
    let min = Infinity;
    let max = -Infinity;
    for (const b of present) {
      const ip = bucket[b].implied;
      if (ip < min) {
        min = ip;
        bestBook = b;
      }
      if (ip > max) max = ip;
    }
    matched.push({ key, quotes: bucket, bookCount: present.length, bestBook, gap: max - min });
  }
  matched.sort((x, y) => y.gap - x.gap);
  console.log("=== Book comparison (multi-book normalized selections) ===");
  console.log(`Books:            ${books.join(", ")}`);
  const comparable: Record<string, number> = Object.fromEntries(books.map((b) => [b, rows.filter((r) => r.source === b && impliedOf(r) !== null).length]));
  console.log(`Comparable rows:  ${books.map((b) => `${b}=${comparable[b]}`).join(", ")}`);
  console.log(`Matched selections (>=2 books): ${matched.length}`);
  console.log("Imported implied_probability is ignored; display gaps use odds_american.");
  console.log("");
  const head = "selection".padEnd(56) + books.map((b) => b.slice(0, 8).padEnd(9)).join("") + "best".padEnd(10) + "gap";
  console.log(head);
  console.log("-".repeat(head.length));
  for (const m of matched.slice(0, 40)) {
    const cols = books.map((b) => fmtAm(m.quotes[b] ? m.quotes[b].am : null).padEnd(9)).join("");
    console.log(m.key.slice(0, 55).padEnd(56) + cols + m.bestBook.padEnd(10) + pct(m.gap));
  }
  mkdirSync(dirname(CSV_OUT), { recursive: true });
  const csv = [
    `selection,${books.map((b) => `${b}_american`).join(",")},book_count,best_book,implied_gap`,
    ...matched.map(
      (m) =>
        `"${m.key.replace(/"/g, '""')}",${books.map((b) => (m.quotes[b] ? m.quotes[b].am ?? "" : "")).join(",")},${m.bookCount},${m.bestBook},${m.gap.toFixed(4)}`,
    ),
  ].join("\n");
  writeFileSync(CSV_OUT, `${csv}\n`, "utf8");
  console.log(`\nMatched ${matched.length} selections across ${books.length} books. CSV written: ${CSV_OUT}`);
}
main();
