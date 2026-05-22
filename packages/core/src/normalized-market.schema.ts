import type { MarketSource, NormalizedMarket, NormalizedMarketStatus } from "./market-normalization";

/**
 * Lightweight, dependency-free validation for normalized market rows. Run after
 * an adapter and before the rows reach the engine, so malformed output is caught
 * at ingestion time rather than producing silent garbage signals.
 */

const SOURCES: MarketSource[] = ["novig", "prophetx", "bovada", "kalshi", "rebet", "4c", "unknown"];
const STATUSES: NormalizedMarketStatus[] = ["open", "suspended", "closed", "upcoming", "unknown"];

const REQUIRED_STRINGS = [
  "event_id",
  "event_name",
  "sport",
  "league",
  "market_type",
  "side",
  "timestamp",
  "period",
] as const;

const OPTIONAL_STRING_OR_NULL = ["sourceMarketId", "sourceOutcomeId", "sourceEventId", "player"] as const;

export type ValidationIssue = { index: number; field: string; message: string };
export type ValidationResult = { valid: boolean; issues: ValidationIssue[]; checked: number };

function isNumberOrNull(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "number" && Number.isFinite(value));
}

export function validateNormalizedRow(row: unknown, index = 0): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (field: string, message: string) => issues.push({ index, field, message });

  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    push("(row)", "row is not an object");
    return issues;
  }
  const r = row as Record<string, unknown>;

  for (const field of REQUIRED_STRINGS) {
    if (typeof r[field] !== "string" || (r[field] as string).length === 0) {
      push(field, "missing or empty string");
    }
  }

  if (!SOURCES.includes(r.source as MarketSource)) push("source", `invalid source: ${String(r.source)}`);
  if (!STATUSES.includes(r.status as NormalizedMarketStatus)) push("status", `invalid status: ${String(r.status)}`);
  if (typeof r.live !== "boolean") push("live", "must be a boolean");

  if (!isNumberOrNull(r.line)) push("line", "must be a finite number or null");
  if (!isNumberOrNull(r.odds_american)) push("odds_american", "must be a finite number or null");

  if (!isNumberOrNull(r.implied_probability)) {
    push("implied_probability", "must be a finite number or null");
  } else if (typeof r.implied_probability === "number" && (r.implied_probability <= 0 || r.implied_probability >= 1)) {
    push("implied_probability", "must be within (0,1) when present");
  }

  if (!isNumberOrNull(r.liquidity)) push("liquidity", "must be a finite number or null");

  // odds and implied probability should agree on presence
  const hasOdds = typeof r.odds_american === "number";
  const hasImplied = typeof r.implied_probability === "number";
  if (hasOdds !== hasImplied) {
    push("odds_american/implied_probability", "odds and implied probability must both be present or both absent");
  }

  for (const field of OPTIONAL_STRING_OR_NULL) {
    const v = r[field];
    if (v !== undefined && v !== null && typeof v !== "string") {
      push(field, "must be a string, null, or omitted");
    }
  }

  return issues;
}

export function validateNormalizedRows(rows: readonly unknown[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  rows.forEach((row, i) => issues.push(...validateNormalizedRow(row, i)));
  return { valid: issues.length === 0, issues, checked: rows.length };
}

/** Type guard usable in scripts once a row has passed validation. */
export function isNormalizedMarket(row: unknown): row is NormalizedMarket {
  return validateNormalizedRow(row).length === 0;
}
