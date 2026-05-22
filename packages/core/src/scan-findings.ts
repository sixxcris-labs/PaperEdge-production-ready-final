// Unifies the three CSV artifacts emitted by the scan pipeline
// (cross_book_arbs.csv, fair_value_edges.csv, book_comparison.csv) into a
// single ranked list of opportunities, best -> worst, with an "act now" flag
// for the highest-confidence plays. Pure functions only: no fs, no I/O. The
// dashboard reads the files and hands the raw text in here.

export type FindingKind = "arb" | "middle" | "value";

export interface FindingLeg {
  book: string;
  side: string;
  /** American odds as a display string, e.g. "+116" or "-125". */
  odds: string;
  /** Point/line if the market carries one, else "". */
  line: string;
}

export interface ScanFinding {
  /** Stable-ish key for React lists; derived from the row content. */
  id: string;
  kind: FindingKind;
  sport: string;
  league: string;
  /** Human-readable matchup, e.g. "thunder @ spurs". */
  event: string;
  market: string;
  /** What you're actually backing, e.g. the outcome or split. */
  selection: string;
  /** Secondary context line: period / player, blank when not applicable. */
  detail: string;
  legs: FindingLeg[];
  /** Headline edge as a fraction (0.02 = 2%). Arb margin or +EV edge. */
  edge: number;
  /** Short label describing `edge`, e.g. "2.0% locked margin". */
  metric: string;
  books: string[];
  /** 0-100 ranking score; higher = better. */
  score: number;
  /** True when the finding clears the act-now bar (see ACT_NOW). */
  actNow: boolean;
  reason: string;
}

/** Thresholds that decide whether a finding is flagged "act now". */
export const ACT_NOW = {
  /** Guaranteed arb margin (1 - combined implied) at/above this -> act now. */
  arbMinMargin: 0.005,
  /** +EV edge at/above this -> act now. */
  valueMinEdge: 0.03,
} as const;

/** Minimal RFC-4180-ish CSV parser: handles quoted fields and "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      // Skip blank trailing lines.
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** Parse a CSV with a header row into an array of column->value records. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  return rows.slice(1).map((cols) => {
    const rec: Record<string, string> = {};
    header.forEach((key, idx) => {
      rec[key] = cols[idx] ?? "";
    });
    return rec;
  });
}

function fmtAmerican(raw: string): string {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return raw || "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function shortEvent(event: string): string {
  // "oklahoma city thunder @ san antonio spurs" / "... vs ...": keep last word
  // of each side so the table stays scannable.
  const sep = event.includes(" @ ") ? " @ " : event.includes(" vs ") ? " vs " : null;
  if (!sep) return event;
  const [a, b] = event.split(sep);
  const last = (s: string) => s.trim().split(/\s+/).slice(-1)[0] ?? s.trim();
  return `${last(a)} ${sep.trim()} ${last(b)}`;
}

/**
 * cross_book_arbs.csv columns:
 * classification,sport,league,event,market,player,period,side_a,line_a,
 * book_a,odds_a,side_b,line_b,book_b,odds_b,combined_implied,reason
 */
export function parseArbFindings(csvText: string): ScanFinding[] {
  const out: ScanFinding[] = [];
  for (const r of parseCsvRecords(csvText)) {
    const cls = r.classification;
    const isArb = cls === "true_arb_candidate";
    const isMiddle = cls === "middle_candidate";
    if (!isArb && !isMiddle) continue; // not_arb / reject carry no edge

    const combined = Number(r.combined_implied);
    const margin = isArb && Number.isFinite(combined) ? 1 - combined : 0;
    const legs: FindingLeg[] = [
      { book: r.book_a, side: r.side_a, odds: fmtAmerican(r.odds_a), line: r.line_a },
      { book: r.book_b, side: r.side_b, odds: fmtAmerican(r.odds_b), line: r.line_b },
    ];
    const detail = [r.player, r.period].filter(Boolean).join(" · ");

    out.push({
      id: `${cls}:${r.event}:${r.market}:${r.side_a}:${r.book_a}:${r.book_b}:${r.odds_a}:${r.odds_b}`,
      kind: isArb ? "arb" : "middle",
      sport: r.sport,
      league: r.league,
      event: shortEvent(r.event),
      market: r.market,
      selection: `${r.side_a} / ${r.side_b}`,
      detail,
      legs,
      edge: isArb ? margin : 0,
      metric: isArb
        ? `${(margin * 100).toFixed(2)}% locked margin`
        : "middle window",
      books: [r.book_a, r.book_b].filter(Boolean),
      score: scoreFinding(isArb ? "arb" : "middle", isArb ? margin : 0),
      actNow: isArb && margin >= ACT_NOW.arbMinMargin,
      reason: r.reason,
    });
  }
  return out;
}

/**
 * fair_value_edges.csv columns:
 * book,market,outcome,offered_prob,fair_prob,edge,reference_books
 * `market` is a pipe key: sport|league|event|markettype|player|period|line
 */
export function parseValueFindings(csvText: string): ScanFinding[] {
  const out: ScanFinding[] = [];
  for (const r of parseCsvRecords(csvText)) {
    const edge = Number(r.edge);
    if (!Number.isFinite(edge) || edge <= 0) continue;

    const parts = r.market.split("|");
    const [sport = "", league = "", event = "", marketType = "", player = "", period = ""] = parts;
    const detail = [player, period].filter((v) => v && v !== "na").join(" · ");
    const offered = Number(r.offered_prob);
    const fair = Number(r.fair_prob);

    out.push({
      id: `value:${r.book}:${r.market}:${r.outcome}`,
      kind: "value",
      sport,
      league,
      event: shortEvent(event),
      market: marketType,
      selection: r.outcome,
      detail,
      legs: [{ book: r.book, side: r.outcome, odds: "", line: "" }],
      edge,
      metric: `+${(edge * 100).toFixed(1)}% EV vs fair${
        Number.isFinite(offered) && Number.isFinite(fair)
          ? ` (${(offered * 100).toFixed(1)}% vs ${(fair * 100).toFixed(1)}%)`
          : ""
      }`,
      books: [r.book],
      score: scoreFinding("value", edge),
      actNow: edge >= ACT_NOW.valueMinEdge,
      reason: `Priced ${(edge * 100).toFixed(1)}% above no-vig consensus of ${r.reference_books} book(s).`,
    });
  }
  return out;
}

/**
 * Tiered score so guaranteed arbs always outrank +EV plays, which outrank
 * middles, with edge size separating ties inside a tier. Range ~0-100.
 */
export function scoreFinding(kind: FindingKind, edge: number): number {
  if (kind === "arb") return Math.min(100, 80 + edge * 1000);
  if (kind === "value") return Math.min(78, 45 + edge * 1000);
  return 35; // middle: present but lowest priority (no locked edge)
}

/** Parse all three artifacts and return one list ranked best -> worst. */
export function buildRankedFindings(inputs: {
  arbsCsv?: string | null;
  valueCsv?: string | null;
}): ScanFinding[] {
  const findings: ScanFinding[] = [];
  if (inputs.arbsCsv) findings.push(...parseArbFindings(inputs.arbsCsv));
  if (inputs.valueCsv) findings.push(...parseValueFindings(inputs.valueCsv));
  return rankFindings(findings);
}

export function rankFindings(findings: ScanFinding[]): ScanFinding[] {
  return [...findings].sort(
    (a, b) => b.score - a.score || b.edge - a.edge || a.event.localeCompare(b.event),
  );
}

/** Books that get their own column in book_comparison.csv, in display order. */
export const COMPARISON_BOOKS = ["bovada", "novig", "4c", "rebet", "prophetx"] as const;

export interface ComparisonRow {
  sport: string;
  league: string;
  event: string;
  market: string;
  selection: string;
  detail: string;
  /** American odds per book as a display string; "" when the book has no price. */
  odds: Record<string, string>;
  bookCount: number;
  bestBook: string;
  /** Implied-probability spread between best and worst book (line-shop edge). */
  gap: number;
}

/**
 * book_comparison.csv columns:
 * selection,bovada_american,novig_american,4c_american,rebet_american,
 * prophetx_american,book_count,best_book,implied_gap
 * `selection` is a pipe key ending in the outcome:
 * sport|league|event|market|player|period|line|side
 */
export function parseComparisonBoard(csvText: string): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const r of parseCsvRecords(csvText)) {
    const parts = r.selection.split("|");
    const [sport = "", league = "", event = "", marketType = "", player = "", period = "", line = "", side = ""] =
      parts;
    const odds: Record<string, string> = {};
    for (const b of COMPARISON_BOOKS) odds[b] = fmtAmerican(r[`${b}_american`] ?? "").replace("—", "");
    const detail = [player, period, line && line !== "na" ? line : ""].filter((v) => v && v !== "na").join(" · ");
    rows.push({
      sport,
      league,
      event: shortEvent(event),
      market: marketType,
      selection: side || player || "—",
      detail,
      odds,
      bookCount: Number(r.book_count) || 0,
      bestBook: r.best_book,
      gap: Number(r.implied_gap) || 0,
    });
  }
  // Widest line-shopping gap first.
  return rows.sort((a, b) => b.gap - a.gap);
}

export interface FindingSummary {
  total: number;
  actNow: number;
  arbs: number;
  middles: number;
  value: number;
  /** Best (largest) edge across all findings, as a fraction. */
  topEdge: number;
}

export function summarizeFindings(findings: ScanFinding[]): FindingSummary {
  return {
    total: findings.length,
    actNow: findings.filter((f) => f.actNow).length,
    arbs: findings.filter((f) => f.kind === "arb").length,
    middles: findings.filter((f) => f.kind === "middle").length,
    value: findings.filter((f) => f.kind === "value").length,
    topEdge: findings.reduce((m, f) => Math.max(m, f.edge), 0),
  };
}
