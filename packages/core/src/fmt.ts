export const fmtUSD = (n: number, opts: { sign?: boolean; decimals?: number } = {}) => {
  const { sign = false, decimals = 2 } = opts;
  const v = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const s = n < 0 ? "−" : sign ? "+" : "";
  return `${s}$${v}`;
};

export const fmtPct = (n: number, decimals = 2) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(decimals)}%`;

export const fmtOdds = (o: number) => (o > 0 ? `+${o}` : `${o}`);

export const americanToDec = (o: number) =>
  o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);

/** Map a DB status string to a badge CSS class + label.
 *  Covers both the full-wizard statuses and the manual-entry statuses.
 *  Always extend here — never define statuses in component files. */
export const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  // ── Manual-entry statuses (MANUAL_STATUSES in constants.ts) ──────────────
  pending_verification:          { label: "Pending Verification", cls: "b-needs"     },
  locked_paper_trade:            { label: "Locked Paper Trade",   cls: "b-locked"    },
  locked_paper_trade_upgraded:   { label: "Locked · Upgraded",    cls: "b-locked"    },
  replaced_removed:              { label: "Replaced / Removed",   cls: "b-draft"     },
  settled_win:                   { label: "Settled · Win",        cls: "b-settled-w" },
  settled_loss:                  { label: "Settled · Loss",       cls: "b-settled-l" },
  settled_push_void:             { label: "Settled · Push/Void",  cls: "b-voided"    },
  // ── Full-wizard statuses (TRADE_STATUSES in constants.ts) ────────────────
  draft:                         { label: "Draft",                cls: "b-draft"     },
  unverified:                    { label: "Needs Verification",   cls: "b-needs"     },
  verifying:                     { label: "Verifying…",      cls: "b-needs"     },
  verified:                      { label: "Verified",             cls: "b-verified"  },
  ready:                         { label: "Verified",             cls: "b-verified"  },
  paper_traded:                  { label: "Locked Paper Trade",   cls: "b-locked"    },
  pending_result:                { label: "Pending Result",       cls: "b-needs"     },
  settled_won:                   { label: "Settled · Win",        cls: "b-settled-w" },
  settled_lost:                  { label: "Settled · Loss",       cls: "b-settled-l" },
  settled_push:                  { label: "Settled · Push",       cls: "b-voided"    },
  settled_partial:               { label: "Settled · Partial",    cls: "b-warn"      },
  mistake_invalid:               { label: "Mistake / Invalid",    cls: "b-mistake"   },
  cancelled:                     { label: "Cancelled",            cls: "b-draft"     },
  // ── Legacy / alias names that may exist in older records ─────────────────
  needs:                         { label: "Needs Verification",   cls: "b-needs"     },
  locked:                        { label: "Locked Paper Trade",   cls: "b-locked"    },
  voided:                        { label: "Voided",               cls: "b-voided"    },
  mistake:                       { label: "Mistake Found",        cls: "b-mistake"   },
  // ── Verification-failure statuses (written by verify-leg API) ────────────
  not_placed_line_moved:         { label: "Line Moved",           cls: "b-warn"      },
  not_placed_odds_moved:         { label: "Odds Moved",           cls: "b-warn"      },
  not_placed_market_unavailable: { label: "Market Gone",          cls: "b-loss"      },
  not_placed_player_not_listed:  { label: "Player Missing",       cls: "b-loss"      },
  not_placed_book_unavailable:   { label: "Book N/A",             cls: "b-draft"     },
  not_placed_other:              { label: "Not Placed",           cls: "b-draft"     },
};

export function statusBadge(status: string) {
  return STATUS_MAP[status] ?? { label: status, cls: "b-draft" };
}

/** Sport dot color class */
const SPORT_CLASSES: Record<string, string> = {
  nba: "nba", nfl: "nfl", mlb: "mlb", nhl: "nhl",
  soccer: "soccer", mma: "mma", tennis: "tennis",
};
const SPORT_LABELS: Record<string, string> = {
  nba: "NBA", nfl: "NFL", mlb: "MLB", nhl: "NHL",
  soccer: "Soccer", mma: "MMA", tennis: "Tennis",
};

export function sportInfo(sport: string) {
  return {
    cls: SPORT_CLASSES[sport?.toLowerCase()] ?? "other",
    label: SPORT_LABELS[sport?.toLowerCase()] ?? sport?.toUpperCase() ?? "Other",
  };
}
