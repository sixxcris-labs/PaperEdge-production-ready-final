/**
 * Side-by-side book comparison.
 *
 * Reads two normalized JSONL files (the output of scripts/normalize-*.ts),
 * buckets rows by their `source`, and joins matching selections across the two
 * books to surface price gaps.
 *
 * This is NOT the edge engine. It is a pragmatic, read-only comparison limited
 * to the markets whose identity is reliably alignable across books today:
 *   - moneyline   (matched by team)
 *   - point spread (matched by team + signed line)
 *   - game total   (matched by over/under + line)
 * Player props and team totals are skipped — matching those across books needs
 * the player/market reconciliation that belongs in the edge layer.
 *
 * Cross-book identity shims (documented, intentionally simple):
 *   - market_type vocab differs ("point spread" vs "spread") -> classed below.
 *   - team identity differs (Bovada full names vs Novig symbols) -> TEAM_ALIASES.
 *     The real fix is threading a stable competitor id through the adapters;
 *     this map is a stopgap. Extend it for other teams as needed.
 *
 * Run from repo root:
 *   npx tsx scripts/compare-books.ts
 *   npx tsx scripts/compare-books.ts normalized_data/novig_normalized.jsonl normalized_data/bovada_normalized.jsonl
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"];
const DEFAULT_INPUTS = BOOKS.map((b) => resolve(repoRoot, "normalized_data", `${b}_normalized.jsonl`));
const CSV_OUT = resolve(repoRoot, "normalized_data", "book_comparison.csv");

type Row = {
  source: string;
  event_name: string;
  market_type: string;
  side: string;
  line: number | null;
  odds_american: number | null;
  implied_probability: number | null;
  period: string;
};

// --- cross-book identity shims ---------------------------------------------

const TEAM_ALIASES: Record<string, string> = {
  "oklahoma city thunder": "OKC",
  okc: "OKC",
  thunder: "OKC",
  "san antonio spurs": "SAS",
  sas: "SAS",
  sa: "SAS",
  spurs: "SAS",
};

function americanToImplied(american: number): number | null {
  if (!Number.isFinite(american) || american === 0) return null;
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100);
}

function impliedOf(row: Row): number | null {
  if (row.implied_probability !== null && row.implied_probability > 0 && row.implied_probability < 1) {
    return row.implied_probability;
  }
  return row.odds_american !== null ? americanToImplied(row.odds_american) : null;
}

function marketClass(type: string): "moneyline" | "spread" | "total" | null {
  const s = type.toLowerCase();
  if (/moneyline|^money(_|$)/.test(s)) return "moneyline";
  if (/spread/.test(s)) return "spread";
  if (/^total$|^total points$/.test(s)) return "total";
  return null;
}

function periodOf(row: Row): string {
  if (row.period && row.period !== "full_game" && row.period !== "unknown") return row.period;
  const s = row.side.toLowerCase();
  if (/\b1h\b|first half|- 1h/.test(s)) return "first_half";
  if (/\b2h\b|second half|- 2h/.test(s)) return "second_half";
  return "full_game";
}

function teamOf(side: string): string {
  const cleaned = side
    .toLowerCase()
    .replace(/\s*-\s*[12][hq]$/, "")
    .replace(/\s*[-+]?\d+(\.\d+)?$/, "")
    .trim();
  if (TEAM_ALIASES[cleaned]) return TEAM_ALIASES[cleaned];
  for (const alias of Object.keys(TEAM_ALIASES)) {
    if (cleaned.includes(alias)) return TEAM_ALIASES[alias];
  }
  return cleaned;
}

function overUnderOf(side: string): "over" | "under" | null {
  const s = side.toLowerCase();
  if (s.startsWith("over")) return "over";
  if (s.startsWith("under")) return "under";
  return null;
}

function signedSpread(row: Row): number | null {
  const m = row.side.toLowerCase().match(/[-+]?\d+(\.\d+)?$/);
  if (m) return Number(m[0]);
  return row.line;
}

/** Canonical join key, or null if this row is not in a comparable class. */
function comparisonKey(row: Row): string | null {
  const cls = marketClass(row.market_type);
  if (!cls) return null;
  const period = periodOf(row);
  if (cls === "moneyline") return `ml|${period}|${teamOf(row.side)}`;
  if (cls === "total") {
    const ou = overUnderOf(row.side);
    if (ou === null || row.line === null) return null;
    return `total|${period}|${row.line}|${ou}`;
  }
  // spread
  const ln = signedSpread(row);
  if (ln === null) return null;
  return `spread|${period}|${teamOf(row.side)}|${ln}`;
}

// --- io ---------------------------------------------------------------------

function readJsonl(path: string): Row[] {
  if (!existsSync(path)) {
    console.warn(`(skip) missing input: ${relative(repoRoot, path)}`);
    return [];
  }
  const out: Row[] = [];
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as Row);
    } catch {
      // skip malformed line, stay defensive
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
  const inputs = process.argv.length > 2 ? process.argv.slice(2).map((p) => resolve(repoRoot, p)) : DEFAULT_INPUTS;
  const rows = inputs.flatMap(readJsonl);

  // book column order: known BOOKS first (as configured), then any extras seen
  const seen = [...new Set(rows.map((r) => r.source))];
  const books = [...BOOKS.filter((b) => seen.includes(b)), ...seen.filter((s) => !BOOKS.includes(s))];
  if (books.length < 2) {
    console.error(`Need at least 2 books with data to compare; found: [${seen.join(", ")}]`);
    process.exit(1);
  }

  // key -> { [source]: best (lowest implied = best price) quote }
  const indexed = new Map<string, Record<string, { am: number | null; implied: number }>>();
  for (const row of rows) {
    const implied = impliedOf(row);
    if (implied === null) continue;
    const key = comparisonKey(row);
    if (!key) continue;
    const bucket = indexed.get(key) ?? {};
    const existing = bucket[row.source];
    if (!existing || implied < existing.implied) bucket[row.source] = { am: row.odds_american, implied };
    indexed.set(key, bucket);
  }

  type Matched = {
    key: string;
    quotes: Record<string, { am: number | null; implied: number }>;
    bookCount: number;
    bestBook: string; // lowest implied prob = best price for a backer
    gap: number; // max implied - min implied across books that quote it
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

  console.log("=== Book comparison (multi-book) ===");
  console.log(`Books:            ${books.join(", ")}`);
  const comparable = Object.fromEntries(books.map((b) => [b, rows.filter((r) => r.source === b && comparisonKey(r)).length]));
  console.log(`Comparable rows:  ${books.map((b) => `${b}=${comparable[b]}`).join(", ")}`);
  console.log(`Matched selections (>=2 books): ${matched.length}`);
  console.log("");

  const head = "selection".padEnd(34) + books.map((b) => b.slice(0, 8).padEnd(9)).join("") + "best".padEnd(10) + "gap";
  console.log(head);
  console.log("-".repeat(head.length));
  for (const m of matched.slice(0, 40)) {
    const cols = books.map((b) => fmtAm(m.quotes[b] ? m.quotes[b].am : null).padEnd(9)).join("");
    console.log(m.key.padEnd(34) + cols + m.bestBook.padEnd(10) + pct(m.gap));
  }

  // CSV artifact (one column of american odds per book)
  mkdirSync(dirname(CSV_OUT), { recursive: true });
  const csv = [
    `selection,${books.map((b) => `${b}_american`).join(",")},book_count,best_book,implied_gap`,
    ...matched.map(
      (m) =>
        `${m.key},${books.map((b) => (m.quotes[b] ? m.quotes[b].am ?? "" : "")).join(",")},${m.bookCount},${m.bestBook},${m.gap.toFixed(4)}`,
    ),
  ].join("\n");
  writeFileSync(CSV_OUT, `${csv}\n`, "utf8");
  console.log(`\nMatched ${matched.length} selections across ${books.length} books. CSV written: ${CSV_OUT}`);
}

main();
