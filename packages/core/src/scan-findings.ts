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
  /** KB letter grade (A–F); set for arb/low-hold findings, else undefined. */
  grade?: ArbGrade;
  /** Return on exposure as a fraction (pure arbs only). */
  roe?: number | null;
  /** Combined implied − 1 (negative = locked margin). */
  holdPct?: number | null;
  /** KB trade-type classification. */
  tradeType?: TradeType;
  /** Effective max stake (min known leg liquidity), null when unknown. */
  maxStake?: number | null;
  /** KB rating caveats (e.g. "verify_suspect_roe", "exchange_fee"). */
  flags?: string[];
  /**
   * Expected value per $1 staked (+EV findings only), using the no-vig fair
   * probability and the book's offered odds. 0.125 = +$12.50 per $100. See
   * `expectedValuePerUnit`.
   */
  ev?: number | null;
}

/**
 * Expected value per $1 staked (KB §27, "EV" concept). Uses the no-vig fair
 * win probability as the true probability and the book's offered price (derived
 * from its implied probability) for the payout:
 *
 *   profit per $1 = (1 − offeredProb) / offeredProb        (decimal odds − 1)
 *   EV            = fairProb × profit − (1 − fairProb) × 1
 *
 * Worked check (KB example): +150 → offeredProb 0.40, fairProb 0.45 →
 *   profit = 0.6/0.4 = 1.5; EV = 0.45×1.5 − 0.55 = +0.125 = +$12.50 per $100.
 *
 * A positive EV is a long-run edge on one side, NOT a guaranteed win like an
 * arb — it carries outcome risk and needs volume + bankroll discipline.
 */
export function expectedValuePerUnit(fairProb: number, offeredProb: number): number | null {
  if (
    !Number.isFinite(fairProb) ||
    !Number.isFinite(offeredProb) ||
    offeredProb <= 0 ||
    offeredProb >= 1 ||
    fairProb < 0 ||
    fairProb > 1
  ) {
    return null;
  }
  const profitPerUnit = (1 - offeredProb) / offeredProb;
  return fairProb * profitPerUnit - (1 - fairProb);
}

/** Thresholds that decide whether a finding is flagged "act now". */
export const ACT_NOW = {
  /** Guaranteed arb margin (1 - combined implied) at/above this -> act now. */
  arbMinMargin: 0.005,
  /** +EV edge at/above this -> act now. */
  valueMinEdge: 0.03,
} as const;

// ─── KB-aligned arb rating ───────────────────────────────────────────────────
// Encodes the OddsFlex knowledge base "truth" for rating arb trades:
//   • Return on Exposure (ROE): 1–3% typical, 4–5% rare, >5% uncommon and
//     usually a stale line / market mismatch — verify, don't trust blindly.
//     (KB §27.1, §27.2)
//   • Hold/width: lower is better; a same-line pair that doesn't clear 100%
//     is a low-hold move, not an arb (KB §16, §24, §27.3).
//   • Liquidity = effective max bet on exchange books (KB §9, §28, §27.4 #2):
//     an exchange leg with no executable size can't be filled.
//   • Fee-adjusted odds: ProfitX/prophetx takes a fee on winning bets, so raw
//     odds overstate the edge (KB §28, §27.4 #4).
//   • Trade type drives the return profile (KB §27.3).

/** Exchange/order-book books where displayed liquidity IS the max bet. */
export const EXCHANGE_BOOKS = new Set(["novig", "prophetx", "4c"]);
/** Books that take a fee on winning bets; raw odds overstate the edge. */
export const FEE_BOOKS = new Set(["prophetx"]);

/** ROE band edges as fractions (KB §27.1). */
export const ROE_BANDS = {
  /** Below this, friction (fees/movement) tends to eat the edge. */
  marginal: 0.01,
  /** Upper edge of the "typical" capturable band. */
  typicalMax: 0.03,
  /** Upper edge of the "rare but real" band; above this is suspect. */
  rareMax: 0.05,
} as const;

export type TradeType = "pure_arb" | "low_hold" | "middle" | "not_comparable";
export type ArbGrade = "A" | "B" | "C" | "D" | "F";

export interface ArbRating {
  tradeType: TradeType;
  /** Return on exposure as a fraction (pure_arb only), else null. */
  roe: number | null;
  /** Combined implied − 1 (negative = locked arb margin), null when unknown. */
  holdPct: number | null;
  grade: ArbGrade;
  /** 0–100 ranking score; realistic+executable arbs rank highest. */
  score: number;
  /** Min known leg liquidity = effective max stake, null when unknown. */
  maxStake: number | null;
  /** False when an exchange leg has explicit non-positive liquidity. */
  executable: boolean;
  /** Machine-readable caveats, e.g. "verify_suspect_roe", "exchange_fee". */
  flags: string[];
}

export interface ArbRatingInput {
  classification: string;
  /** Sum of both legs' implied probabilities (same-line pairs only). */
  combinedImplied: number | null;
  bookA: string;
  bookB: string;
  liquidityA?: number | null;
  liquidityB?: number | null;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Rate a same-market pair using the KB's ROE/hold/liquidity logic. Pure: same
 * input → same rating, so the report and the dashboard agree.
 */
export function rateArb(input: ArbRatingInput): ArbRating {
  const a = (input.bookA ?? "").toLowerCase();
  const b = (input.bookB ?? "").toLowerCase();
  const legs: Array<[string, number | null | undefined]> = [
    [a, input.liquidityA],
    [b, input.liquidityB],
  ];
  const flags: string[] = [];

  // Liquidity = effective max bet on exchanges (KB §27.4 #2).
  const knownLiquidity: number[] = [];
  let executable = true;
  for (const [book, liq] of legs) {
    if (typeof liq === "number" && Number.isFinite(liq)) {
      knownLiquidity.push(liq);
      if (EXCHANGE_BOOKS.has(book) && liq <= 0) {
        executable = false;
        flags.push(`illiquid:${book}`);
      }
    } else if (EXCHANGE_BOOKS.has(book)) {
      flags.push(`liquidity_unknown:${book}`);
    }
  }
  const maxStake = knownLiquidity.length > 0 ? Math.min(...knownLiquidity) : null;
  const hasFeeLeg = FEE_BOOKS.has(a) || FEE_BOOKS.has(b);
  if (hasFeeLeg) flags.push("exchange_fee");

  // Middles carry no single combined-implied number; rate as their own bucket.
  if (input.classification === "middle_candidate") {
    return { tradeType: "middle", roe: null, holdPct: null, grade: "C", score: 35, maxStake, executable, flags };
  }

  const combined = input.combinedImplied;
  if (combined === null || !Number.isFinite(combined) || combined <= 0) {
    // reject / non-comparable rows.
    return { tradeType: "not_comparable", roe: null, holdPct: null, grade: "F", score: 0, maxStake, executable, flags };
  }

  const holdPct = combined - 1;

  if (combined < 1) {
    // Pure cash arbitrage: ROE = payout/exposure − 1 (KB §27.2).
    const roe = 1 / combined - 1;
    let grade: ArbGrade;
    let score: number;
    if (roe > ROE_BANDS.rareMax) {
      // >5%: almost always a stale line or market mismatch (KB §27.1).
      flags.push("verify_suspect_roe");
      grade = "C";
      score = 50;
    } else if (roe > ROE_BANDS.typicalMax) {
      // 3–5%: real but uncommon and harder to execute cleanly (KB §27.1).
      flags.push("verify_uncommon_roe");
      grade = "B";
      score = 78 + ((roe - ROE_BANDS.typicalMax) / (ROE_BANDS.rareMax - ROE_BANDS.typicalMax)) * 7;
    } else if (roe >= ROE_BANDS.marginal) {
      // 1–3%: the capturable sweet spot.
      grade = "A";
      score = 85 + ((roe - ROE_BANDS.marginal) / (ROE_BANDS.typicalMax - ROE_BANDS.marginal)) * 10;
    } else {
      // <1%: friction may erase it (KB §27.4).
      flags.push("marginal_roe");
      grade = "C";
      score = 60 + (roe / ROE_BANDS.marginal) * 10;
    }

    // Realized-ROE friction adjustments (KB §27.4).
    if (maxStake === null) score -= 8; // can't confirm size on an exchange leg
    if (hasFeeLeg) score -= 3; // raw odds overstate the edge
    if (!executable) {
      // An exchange leg with no size can't be filled — not a real opportunity.
      grade = "F";
      score = Math.min(score, 30);
    }

    return { tradeType: "pure_arb", roe, holdPct, grade, score: clampScore(score), maxStake, executable, flags };
  }

  // combined ≥ 1: opposite sides, same line, but no locked margin → low-hold
  // move to shift/clear funds. KB rule of thumb: ≤3% cost is workable (§24).
  const cost = holdPct; // positive
  let grade: ArbGrade;
  let score: number;
  if (cost <= 0.03) {
    grade = "D";
    score = 45 - (cost / 0.03) * 15; // tighter hold ranks higher (30–45)
  } else {
    flags.push("hold_too_high");
    grade = "F";
    score = 20;
  }
  if (!executable) {
    grade = "F";
    score = Math.min(score, 15);
  }
  return { tradeType: "low_hold", roe: null, holdPct, grade, score: clampScore(score), maxStake, executable, flags };
}

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

function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * cross_book_arbs.csv columns:
 * classification,sport,league,event,market,player,period,side_a,line_a,
 * book_a,odds_a,side_b,line_b,book_b,odds_b,combined_implied,reason,
 * liq_a,liq_b,roe,hold_pct,max_stake,trade_type,rating,score,flags
 *
 * The rating columns are recomputed here via `rateArb` (not just read back) so
 * the dashboard ranking always matches the report's KB logic, even on older
 * CSVs missing those columns.
 */
export function parseArbFindings(csvText: string): ScanFinding[] {
  const out: ScanFinding[] = [];
  for (const r of parseCsvRecords(csvText)) {
    const cls = r.classification;
    const isArb = cls === "true_arb_candidate";
    const isMiddle = cls === "middle_candidate";
    if (!isArb && !isMiddle) continue; // not_arb / reject not surfaced as findings

    const combined = numOrNull(r.combined_implied);
    const rating = rateArb({
      classification: cls,
      combinedImplied: combined,
      bookA: r.book_a,
      bookB: r.book_b,
      liquidityA: numOrNull(r.liq_a),
      liquidityB: numOrNull(r.liq_b),
    });
    const legs: FindingLeg[] = [
      { book: r.book_a, side: r.side_a, odds: fmtAmerican(r.odds_a), line: r.line_a },
      { book: r.book_b, side: r.side_b, odds: fmtAmerican(r.odds_b), line: r.line_b },
    ];
    const detail = [r.player, r.period].filter(Boolean).join(" · ");
    // Headline edge: ROE for arbs, locked margin fallback, else 0 for middles.
    const edge = isArb ? rating.roe ?? (combined !== null ? 1 - combined : 0) : 0;
    const metric = isArb
      ? `${(edge * 100).toFixed(2)}% ROE · ${rating.grade}${
          rating.maxStake !== null ? ` · max $${Math.floor(rating.maxStake).toLocaleString()}` : ""
        }`
      : "middle window";

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
      edge,
      metric,
      books: [r.book_a, r.book_b].filter(Boolean),
      score: rating.score,
      // Act now only on grade-A arbs: executable, realistic 1–3% ROE (KB §27.1).
      actNow: isArb && rating.grade === "A",
      reason: r.reason,
      grade: rating.grade,
      roe: rating.roe,
      holdPct: rating.holdPct,
      tradeType: rating.tradeType,
      maxStake: rating.maxStake,
      flags: rating.flags,
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
    const ev = expectedValuePerUnit(fair, offered);

    // Headline shows true expected value per $1 (KB EV), with the fair-vs-offered
    // context that produced it.
    const metric =
      ev !== null
        ? `+${(ev * 100).toFixed(1)}% EV ($${(ev * 100).toFixed(2)}/$100)${
            Number.isFinite(offered) && Number.isFinite(fair)
              ? ` · ${(offered * 100).toFixed(1)}% vs ${(fair * 100).toFixed(1)}% fair`
              : ""
          }`
        : `+${(edge * 100).toFixed(1)}% vs fair`;

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
      metric,
      books: [r.book],
      score: scoreFinding("value", edge),
      actNow: edge >= ACT_NOW.valueMinEdge,
      reason: `Priced ${(edge * 100).toFixed(1)}% above no-vig consensus of ${r.reference_books} book(s). EV ${
        ev !== null ? `${(ev * 100).toFixed(1)}% per $1` : "n/a"
      } at the offered price.`,
      ev,
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
