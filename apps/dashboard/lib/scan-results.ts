import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRankedFindings,
  parseComparisonBoard,
  summarizeFindings,
  COMPARISON_BOOKS,
  type ComparisonRow,
  type FindingSummary,
  type ScanFinding,
} from "@paperedge/core/scan-findings";

const SCANNER_CONFIG = "config/paperedge.scanner.config.json";

/**
 * The dev/start command runs `next` from inside apps/dashboard, so cwd is not
 * guaranteed to be the repo root. Walk up until we find the marker config the
 * pipeline writes alongside the normalized_data outputs.
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(dir, SCANNER_CONFIG))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function readIfExists(path: string): { text: string | null; mtime: Date | null } {
  if (!existsSync(path)) return { text: null, mtime: null };
  return { text: readFileSync(path, "utf8"), mtime: statSync(path).mtime };
}

/** How many normalized markets each book contributed to the last scan. */
export interface BookCoverage {
  book: string;
  markets: number;
}

export interface ScanResults {
  findings: ScanFinding[];
  summary: FindingSummary;
  /** Cross-book line-shopping board (selections quoted by 2+ books). */
  board: ComparisonRow[];
  /** Per-book captured-market counts, so the user sees everything pulled. */
  coverage: BookCoverage[];
  /** Total normalized markets captured across all books. */
  totalMarkets: number;
  /** Most recent mtime across the source CSVs, or null if none exist yet. */
  lastScanAt: Date | null;
  /** True when no pipeline output files were found on disk. */
  empty: boolean;
}

function countLines(path: string): number {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, "utf8").trim();
  return text === "" ? 0 : text.split("\n").length;
}

export function loadScanResults(): ScanResults {
  const root = findRepoRoot();
  const nd = (name: string) => resolve(root, "normalized_data", name);
  const arbs = readIfExists(nd("cross_book_arbs.csv"));
  const value = readIfExists(nd("fair_value_edges.csv"));
  const comparison = readIfExists(nd("book_comparison.csv"));

  const findings = buildRankedFindings({ arbsCsv: arbs.text, valueCsv: value.text });
  const board = comparison.text ? parseComparisonBoard(comparison.text) : [];

  const coverage: BookCoverage[] = COMPARISON_BOOKS.map((book) => ({
    book,
    markets: countLines(nd(`${book}_normalized.jsonl`)),
  }));
  const totalMarkets = coverage.reduce((s, c) => s + c.markets, 0);

  const mtimes = [arbs.mtime, value.mtime, comparison.mtime].filter((m): m is Date => m != null);
  const lastScanAt =
    mtimes.length > 0 ? new Date(Math.max(...mtimes.map((m) => m.getTime()))) : null;

  return {
    findings,
    summary: summarizeFindings(findings),
    board,
    coverage,
    totalMarkets,
    lastScanAt,
    empty: arbs.text === null && value.text === null && comparison.text === null,
  };
}
