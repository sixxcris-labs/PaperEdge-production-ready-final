/**
 * Canonical trade-status model for PaperEdge.
 *
 * Every page, query, server action, badge, and filter MUST funnel through this
 * file. Do not redefine status sets inline — extend the groups here instead.
 *
 * Two historical status vocabularies exist on disk:
 *   - "wizard" flow: draft / unverified / verifying / verified / ready /
 *     paper_traded / pending_result / settled_won / settled_lost /
 *     settled_push / settled_partial / mistake_invalid / cancelled
 *   - "manual" flow: pending_verification / locked_paper_trade /
 *     locked_paper_trade_upgraded / replaced_removed / settled_win /
 *     settled_loss / settled_push_void
 *
 * Plus six verification-failure statuses (not_placed_*) and four legacy
 * aliases (needs, locked, voided, mistake) that may exist in old records.
 *
 * This module groups them all into eight semantic buckets the dashboard,
 * verifier, and reporting layers can rely on without caring which vocabulary
 * produced a given row.
 */

// ─── Raw status strings ──────────────────────────────────────────────────────
// Listed once, in stable order. Any new status must be added here AND to one
// of the GROUP sets below — otherwise it falls through to `unknown`.

export const STATUS = {
  // Pre-import / scratch
  draft: "draft",

  // Imported but not yet verified
  unverified: "unverified",            // wizard
  verifying: "verifying",              // wizard, transitional
  pending_verification: "pending_verification", // manual

  // Verification passed; not yet locked as a paper trade
  verified: "verified",                // wizard
  ready: "ready",                      // wizard (post-checklist)

  // Locked paper trade with real (paper) exposure, awaiting settlement
  paper_traded: "paper_traded",        // wizard
  locked_paper_trade: "locked_paper_trade",                     // manual
  locked_paper_trade_upgraded: "locked_paper_trade_upgraded",   // manual

  // Event over, waiting for user to settle
  pending_result: "pending_result",    // wizard

  // Settled outcomes — both vocabularies kept; canonical access via SETTLED.*
  settled_won: "settled_won",          // wizard
  settled_lost: "settled_lost",        // wizard
  settled_push: "settled_push",        // wizard
  settled_partial: "settled_partial",  // wizard
  settled_win: "settled_win",          // manual
  settled_loss: "settled_loss",        // manual
  settled_push_void: "settled_push_void", // manual

  // Verification rejected — trade was NOT placed and never had real exposure
  not_placed_line_moved: "not_placed_line_moved",
  not_placed_odds_moved: "not_placed_odds_moved",
  not_placed_market_unavailable: "not_placed_market_unavailable",
  not_placed_player_not_listed: "not_placed_player_not_listed",
  not_placed_book_unavailable: "not_placed_book_unavailable",
  not_placed_other: "not_placed_other",

  // Removed from journal — should never count in dashboard aggregates
  replaced_removed: "replaced_removed", // manual
  cancelled: "cancelled",               // wizard
  mistake_invalid: "mistake_invalid",   // wizard

  // Legacy aliases still readable in old rows (NEVER write these)
  needs: "needs",       // → treat as pending_verification
  locked: "locked",     // → treat as locked_paper_trade
  voided: "voided",     // → treat as settled_push
  mistake: "mistake",   // → treat as mistake_invalid
} as const;

export type TradeStatus = typeof STATUS[keyof typeof STATUS];

// ─── Semantic groups ────────────────────────────────────────────────────────
// These are the buckets the dashboard, verifier, and reports should think in.
// A status MUST belong to exactly one group (excluding aliases, which mirror
// the canonical status they alias).

/** Draft / never submitted. Excluded from all dashboard counts. */
export const DRAFT: ReadonlySet<string> = new Set([STATUS.draft]);

/** Imported opportunities awaiting verification. NOT real exposure. */
export const CANDIDATE: ReadonlySet<string> = new Set([
  STATUS.unverified,
  STATUS.verifying,
  STATUS.pending_verification,
  STATUS.needs, // alias
]);

/** Verified but not yet locked as a paper trade. NOT real exposure. */
export const READY_TO_LOCK: ReadonlySet<string> = new Set([
  STATUS.verified,
  STATUS.ready,
]);

/** Locked paper trades awaiting event/settlement. THIS is real paper exposure. */
export const LOCKED_OPEN: ReadonlySet<string> = new Set([
  STATUS.paper_traded,
  STATUS.locked_paper_trade,
  STATUS.locked_paper_trade_upgraded,
  STATUS.locked, // alias
]);

/** Event finished; user needs to settle. Still real exposure. */
export const PENDING_SETTLEMENT: ReadonlySet<string> = new Set([
  STATUS.pending_result,
]);

/** Settled trades — realized P/L counted here. */
export const SETTLED: ReadonlySet<string> = new Set([
  STATUS.settled_won,
  STATUS.settled_lost,
  STATUS.settled_push,
  STATUS.settled_partial,
  STATUS.settled_win,
  STATUS.settled_loss,
  STATUS.settled_push_void,
  STATUS.voided, // alias
]);

/** Settlement sub-buckets — break out wins vs losses vs pushes. */
export const SETTLED_WIN: ReadonlySet<string> = new Set([
  STATUS.settled_won,
  STATUS.settled_win,
]);
export const SETTLED_LOSS: ReadonlySet<string> = new Set([
  STATUS.settled_lost,
  STATUS.settled_loss,
]);
export const SETTLED_PUSH: ReadonlySet<string> = new Set([
  STATUS.settled_push,
  STATUS.settled_push_void,
  STATUS.voided,
]);
export const SETTLED_PARTIAL: ReadonlySet<string> = new Set([
  STATUS.settled_partial,
]);

/** Verification rejected — trade was never placed, no exposure ever existed. */
export const FAILED_VERIFICATION: ReadonlySet<string> = new Set([
  STATUS.not_placed_line_moved,
  STATUS.not_placed_odds_moved,
  STATUS.not_placed_market_unavailable,
  STATUS.not_placed_player_not_listed,
  STATUS.not_placed_book_unavailable,
  STATUS.not_placed_other,
]);

/** Removed / cancelled / flagged as mistake. Excluded from dashboard aggregates. */
export const EXCLUDED: ReadonlySet<string> = new Set([
  STATUS.replaced_removed,
  STATUS.cancelled,
  STATUS.mistake_invalid,
  STATUS.mistake, // alias
]);

// ─── Derived sets ───────────────────────────────────────────────────────────
// These are unions used by dashboard queries. Express them via the base groups
// so adding a new status to (say) LOCKED_OPEN automatically flows through.

/** Real paper exposure: locked + pending settlement. Use for "Open Exposure". */
export const OPEN_EXPOSURE: ReadonlySet<string> = union(
  LOCKED_OPEN,
  PENDING_SETTLEMENT,
);

/** Opportunities not yet locked. Use for "Candidate Exposure" (display only). */
export const CANDIDATE_EXPOSURE: ReadonlySet<string> = union(
  CANDIDATE,
  READY_TO_LOCK,
);

/** Everything that isn't excluded / draft / failed. Default dashboard filter. */
export const ACTIVE_OR_HISTORICAL: ReadonlySet<string> = union(
  CANDIDATE,
  READY_TO_LOCK,
  LOCKED_OPEN,
  PENDING_SETTLEMENT,
  SETTLED,
);

/** Settled or failed — i.e., trade has reached a terminal state of some kind. */
export const TERMINAL: ReadonlySet<string> = union(
  SETTLED,
  FAILED_VERIFICATION,
  EXCLUDED,
);

// ─── Group identifier (for badges, filters, switch statements) ──────────────

export type StatusGroup =
  | "draft"
  | "candidate"
  | "ready_to_lock"
  | "locked_open"
  | "pending_settlement"
  | "settled"
  | "failed_verification"
  | "excluded"
  | "unknown";

/** Return the canonical group for any status string (alias-aware). */
export function statusGroup(status: string | null | undefined): StatusGroup {
  if (!status) return "unknown";
  if (DRAFT.has(status)) return "draft";
  if (CANDIDATE.has(status)) return "candidate";
  if (READY_TO_LOCK.has(status)) return "ready_to_lock";
  if (LOCKED_OPEN.has(status)) return "locked_open";
  if (PENDING_SETTLEMENT.has(status)) return "pending_settlement";
  if (SETTLED.has(status)) return "settled";
  if (FAILED_VERIFICATION.has(status)) return "failed_verification";
  if (EXCLUDED.has(status)) return "excluded";
  return "unknown";
}

/** Settled sub-bucket: which kind of settlement was this? */
export type SettledKind = "win" | "loss" | "push" | "partial" | null;

export function settledKind(status: string | null | undefined): SettledKind {
  if (!status) return null;
  if (SETTLED_WIN.has(status)) return "win";
  if (SETTLED_LOSS.has(status)) return "loss";
  if (SETTLED_PUSH.has(status)) return "push";
  if (SETTLED_PARTIAL.has(status)) return "partial";
  return null;
}

// ─── Predicates ─────────────────────────────────────────────────────────────
// Short, intent-revealing helpers. Use these in queries and components instead
// of poking at the raw sets — the predicate name documents what the caller means.

export const isDraft = (s?: string | null) => !!s && DRAFT.has(s);
export const isCandidate = (s?: string | null) => !!s && CANDIDATE.has(s);
export const isReadyToLock = (s?: string | null) => !!s && READY_TO_LOCK.has(s);
export const isLockedOpen = (s?: string | null) => !!s && LOCKED_OPEN.has(s);
export const isPendingSettlement = (s?: string | null) =>
  !!s && PENDING_SETTLEMENT.has(s);
export const isSettled = (s?: string | null) => !!s && SETTLED.has(s);
export const isFailedVerification = (s?: string | null) =>
  !!s && FAILED_VERIFICATION.has(s);
export const isExcluded = (s?: string | null) => !!s && EXCLUDED.has(s);

/** True if the trade represents real paper exposure right now. */
export const hasOpenExposure = (s?: string | null) =>
  !!s && OPEN_EXPOSURE.has(s);

/** True if the trade is an opportunity not yet locked. */
export const hasCandidateExposure = (s?: string | null) =>
  !!s && CANDIDATE_EXPOSURE.has(s);

/** True if the trade should appear in the default dashboard view. */
export const isVisibleOnDashboard = (s?: string | null) =>
  !!s && !isExcluded(s) && !isDraft(s);

/** True if the trade has reached any terminal state (settled/failed/excluded). */
export const isTerminal = (s?: string | null) => !!s && TERMINAL.has(s);

// ─── Display & filtering ────────────────────────────────────────────────────

/** Stable filter keys for dashboard tabs / dropdowns. Keep ordered. */
export const STATUS_GROUP_FILTERS: ReadonlyArray<{
  key: StatusGroup;
  label: string;
}> = [
  { key: "candidate",           label: "Candidate (unverified)" },
  { key: "ready_to_lock",       label: "Ready to lock" },
  { key: "locked_open",         label: "Locked (open)" },
  { key: "pending_settlement",  label: "Pending settlement" },
  { key: "settled",             label: "Settled" },
  { key: "failed_verification", label: "Failed verification" },
  { key: "excluded",            label: "Removed / cancelled" },
  { key: "draft",               label: "Draft" },
];

/** Prisma-friendly array form of any group, for `where: { status: { in: ... } }`. */
export function groupList(group: StatusGroup): string[] {
  switch (group) {
    case "draft":               return [...DRAFT];
    case "candidate":           return [...CANDIDATE];
    case "ready_to_lock":       return [...READY_TO_LOCK];
    case "locked_open":         return [...LOCKED_OPEN];
    case "pending_settlement":  return [...PENDING_SETTLEMENT];
    case "settled":             return [...SETTLED];
    case "failed_verification": return [...FAILED_VERIFICATION];
    case "excluded":            return [...EXCLUDED];
    case "unknown":             return [];
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function union(...sets: ReadonlySet<string>[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}
