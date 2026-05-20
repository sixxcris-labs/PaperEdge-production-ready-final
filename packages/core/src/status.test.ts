import { describe, it, expect } from "vitest";
import {
  STATUS,
  statusGroup,
  settledKind,
  isDraft,
  isCandidate,
  isReadyToLock,
  isLockedOpen,
  isPendingSettlement,
  isSettled,
  isFailedVerification,
  isExcluded,
  hasOpenExposure,
  hasCandidateExposure,
  isVisibleOnDashboard,
  isTerminal,
  groupList,
  CANDIDATE,
  LOCKED_OPEN,
  SETTLED,
  FAILED_VERIFICATION,
  EXCLUDED,
  OPEN_EXPOSURE,
  CANDIDATE_EXPOSURE,
} from "./status";

describe("statusGroup", () => {
  it("classifies wizard-vocab statuses", () => {
    expect(statusGroup("draft")).toBe("draft");
    expect(statusGroup("unverified")).toBe("candidate");
    expect(statusGroup("verifying")).toBe("candidate");
    expect(statusGroup("verified")).toBe("ready_to_lock");
    expect(statusGroup("ready")).toBe("ready_to_lock");
    expect(statusGroup("paper_traded")).toBe("locked_open");
    expect(statusGroup("pending_result")).toBe("pending_settlement");
    expect(statusGroup("settled_won")).toBe("settled");
    expect(statusGroup("settled_lost")).toBe("settled");
    expect(statusGroup("settled_push")).toBe("settled");
    expect(statusGroup("settled_partial")).toBe("settled");
    expect(statusGroup("mistake_invalid")).toBe("excluded");
    expect(statusGroup("cancelled")).toBe("excluded");
  });

  it("classifies manual-vocab statuses", () => {
    expect(statusGroup("pending_verification")).toBe("candidate");
    expect(statusGroup("locked_paper_trade")).toBe("locked_open");
    expect(statusGroup("locked_paper_trade_upgraded")).toBe("locked_open");
    expect(statusGroup("settled_win")).toBe("settled");
    expect(statusGroup("settled_loss")).toBe("settled");
    expect(statusGroup("settled_push_void")).toBe("settled");
    expect(statusGroup("replaced_removed")).toBe("excluded");
  });

  it("classifies the six not_placed_* failure statuses", () => {
    expect(statusGroup("not_placed_line_moved")).toBe("failed_verification");
    expect(statusGroup("not_placed_odds_moved")).toBe("failed_verification");
    expect(statusGroup("not_placed_market_unavailable")).toBe("failed_verification");
    expect(statusGroup("not_placed_player_not_listed")).toBe("failed_verification");
    expect(statusGroup("not_placed_book_unavailable")).toBe("failed_verification");
    expect(statusGroup("not_placed_other")).toBe("failed_verification");
  });

  it("treats legacy aliases as their canonical group", () => {
    expect(statusGroup("needs")).toBe("candidate");
    expect(statusGroup("locked")).toBe("locked_open");
    expect(statusGroup("voided")).toBe("settled");
    expect(statusGroup("mistake")).toBe("excluded");
  });

  it("returns 'unknown' for unrecognized or empty input", () => {
    expect(statusGroup(undefined)).toBe("unknown");
    expect(statusGroup(null)).toBe("unknown");
    expect(statusGroup("")).toBe("unknown");
    expect(statusGroup("totally_made_up")).toBe("unknown");
  });
});

describe("settledKind", () => {
  it("maps both vocabularies to win/loss/push/partial", () => {
    expect(settledKind("settled_won")).toBe("win");
    expect(settledKind("settled_win")).toBe("win");
    expect(settledKind("settled_lost")).toBe("loss");
    expect(settledKind("settled_loss")).toBe("loss");
    expect(settledKind("settled_push")).toBe("push");
    expect(settledKind("settled_push_void")).toBe("push");
    expect(settledKind("voided")).toBe("push");
    expect(settledKind("settled_partial")).toBe("partial");
  });

  it("returns null for non-settled statuses", () => {
    expect(settledKind("paper_traded")).toBeNull();
    expect(settledKind("unverified")).toBeNull();
    expect(settledKind(undefined)).toBeNull();
  });
});

describe("predicates", () => {
  it("isDraft / isCandidate / isReadyToLock partition pre-lock states", () => {
    expect(isDraft("draft")).toBe(true);
    expect(isCandidate("unverified")).toBe(true);
    expect(isCandidate("pending_verification")).toBe(true);
    expect(isReadyToLock("verified")).toBe(true);
    expect(isReadyToLock("ready")).toBe(true);
    expect(isReadyToLock("unverified")).toBe(false);
  });

  it("isLockedOpen + isPendingSettlement together cover real exposure", () => {
    expect(isLockedOpen("paper_traded")).toBe(true);
    expect(isLockedOpen("locked_paper_trade")).toBe(true);
    expect(isPendingSettlement("pending_result")).toBe(true);
    expect(hasOpenExposure("paper_traded")).toBe(true);
    expect(hasOpenExposure("pending_result")).toBe(true);
    expect(hasOpenExposure("locked_paper_trade_upgraded")).toBe(true);

    // candidates and settled do NOT have open exposure
    expect(hasOpenExposure("unverified")).toBe(false);
    expect(hasOpenExposure("settled_won")).toBe(false);
    expect(hasOpenExposure("not_placed_odds_moved")).toBe(false);
  });

  it("hasCandidateExposure covers unverified + ready, not locked", () => {
    expect(hasCandidateExposure("unverified")).toBe(true);
    expect(hasCandidateExposure("verified")).toBe(true);
    expect(hasCandidateExposure("ready")).toBe(true);
    expect(hasCandidateExposure("paper_traded")).toBe(false);
    expect(hasCandidateExposure("settled_won")).toBe(false);
  });

  it("isSettled / isFailedVerification / isExcluded are mutually exclusive", () => {
    expect(isSettled("settled_win")).toBe(true);
    expect(isFailedVerification("settled_win")).toBe(false);
    expect(isExcluded("settled_win")).toBe(false);

    expect(isFailedVerification("not_placed_line_moved")).toBe(true);
    expect(isSettled("not_placed_line_moved")).toBe(false);
    expect(isExcluded("not_placed_line_moved")).toBe(false);

    expect(isExcluded("replaced_removed")).toBe(true);
    expect(isExcluded("cancelled")).toBe(true);
    expect(isSettled("replaced_removed")).toBe(false);
  });

  it("isVisibleOnDashboard hides draft + excluded only", () => {
    expect(isVisibleOnDashboard("draft")).toBe(false);
    expect(isVisibleOnDashboard("replaced_removed")).toBe(false);
    expect(isVisibleOnDashboard("cancelled")).toBe(false);
    expect(isVisibleOnDashboard("mistake_invalid")).toBe(false);

    expect(isVisibleOnDashboard("unverified")).toBe(true);
    expect(isVisibleOnDashboard("paper_traded")).toBe(true);
    expect(isVisibleOnDashboard("settled_won")).toBe(true);
    expect(isVisibleOnDashboard("not_placed_line_moved")).toBe(true);
  });

  it("isTerminal covers settled, failed verification, and excluded", () => {
    expect(isTerminal("settled_won")).toBe(true);
    expect(isTerminal("not_placed_market_unavailable")).toBe(true);
    expect(isTerminal("replaced_removed")).toBe(true);
    expect(isTerminal("paper_traded")).toBe(false);
    expect(isTerminal("unverified")).toBe(false);
  });
});

describe("group integrity", () => {
  // Catch the bug where a new status accidentally lands in two groups.
  it("CANDIDATE and READY_TO_LOCK do not overlap", () => {
    for (const s of CANDIDATE) {
      expect(statusGroup(s)).toBe("candidate");
    }
  });

  it("LOCKED_OPEN, SETTLED, FAILED_VERIFICATION, EXCLUDED do not overlap", () => {
    const seen = new Map<string, string>();
    const groups: [string, ReadonlySet<string>][] = [
      ["locked_open", LOCKED_OPEN],
      ["settled", SETTLED],
      ["failed_verification", FAILED_VERIFICATION],
      ["excluded", EXCLUDED],
    ];
    for (const [name, set] of groups) {
      for (const s of set) {
        const prev = seen.get(s);
        if (prev) {
          throw new Error(`status "${s}" appears in both "${prev}" and "${name}"`);
        }
        seen.set(s, name);
      }
    }
  });

  it("OPEN_EXPOSURE = LOCKED_OPEN + pending_result", () => {
    expect(OPEN_EXPOSURE.has("paper_traded")).toBe(true);
    expect(OPEN_EXPOSURE.has("locked_paper_trade")).toBe(true);
    expect(OPEN_EXPOSURE.has("pending_result")).toBe(true);
    expect(OPEN_EXPOSURE.has("unverified")).toBe(false);
  });

  it("CANDIDATE_EXPOSURE does not include locked or settled", () => {
    for (const s of LOCKED_OPEN) {
      expect(CANDIDATE_EXPOSURE.has(s)).toBe(false);
    }
    for (const s of SETTLED) {
      expect(CANDIDATE_EXPOSURE.has(s)).toBe(false);
    }
  });
});

describe("groupList", () => {
  it("returns Prisma-friendly arrays for each group", () => {
    expect(groupList("locked_open")).toEqual(
      expect.arrayContaining([
        STATUS.paper_traded,
        STATUS.locked_paper_trade,
        STATUS.locked_paper_trade_upgraded,
      ]),
    );
    expect(groupList("settled").length).toBeGreaterThanOrEqual(7);
    expect(groupList("unknown")).toEqual([]);
  });
});
