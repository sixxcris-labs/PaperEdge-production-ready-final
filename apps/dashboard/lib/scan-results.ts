import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRankedFindings,
  summarizeFindings,
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

export interface ScanResults {
  findings: ScanFinding[];
  summary: FindingSummary;
  /** Most recent mtime across the source CSVs, or null if none exist yet. */
  lastScanAt: Date | null;
  /** True when no pipeline output files were found on disk. */
  empty: boolean;
}

export function loadScanResults(): ScanResults {
  const root = findRepoRoot();
  const arbs = readIfExists(resolve(root, "normalized_data", "cross_book_arbs.csv"));
  const value = readIfExists(resolve(root, "normalized_data", "fair_value_edges.csv"));

  const findings = buildRankedFindings({ arbsCsv: arbs.text, valueCsv: value.text });
  const mtimes = [arbs.mtime, value.mtime].filter((m): m is Date => m != null);
  const lastScanAt =
    mtimes.length > 0 ? new Date(Math.max(...mtimes.map((m) => m.getTime()))) : null;

  return {
    findings,
    summary: summarizeFindings(findings),
    lastScanAt,
    empty: arbs.text === null && value.text === null,
  };
}
