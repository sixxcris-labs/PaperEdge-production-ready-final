import { describe, expect, it } from "vitest";
import type { EdgeSignal } from "./edge-signal-engine";
import { edgeSignalToReviewItem, edgeSignalsToReviewItems } from "./edge-signal-import";
import type { NormalizedMarket } from "./market-normalization";
function market(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    source: "novig",
    event_id: "evt-1",
    event_name: "Knicks vs Cavs",
    sport: "basketball",
    league: "nba",
    market_type: "player_points",
    player: "landry shamet",
    side: "Over",
    line: 27.5,
    odds_american: 110,
    implied_probability: 0.47,
    liquidity: 100,
    timestamp: "2026-05-22T00:00:00.000Z",
    status: "open",
    live: false,
    period: "full_game",
    raw: {},
    ...overrides,
  };
}
function signal(overrides: Partial<EdgeSignal> = {}): EdgeSignal {
  return {
    id: "sig-1",
    type: "same_line_opposite_side",
    severity: "candidate",
    classification: "true_arb_candidate",
    markets: [market(), market({ source: "bovada", side: "Under", liquidity: null })],
    reason: "Test reason",
    verificationNotes: [],
    arbCheck: { combinedImplied: 0.98, trueArb: true, source: "odds_american" },
    createdAt: "2026-05-22T00:00:10.000Z",
    ...overrides,
  };
}
describe("edge-signal-import", () => {
  it("maps candidate signal to raw_candidate", () => {
    const item = edgeSignalToReviewItem(signal({ severity: "candidate" }));
    expect(item.status).toBe("raw_candidate");
  });
  it("maps watch signal to watch", () => {
    const item = edgeSignalToReviewItem(signal({ severity: "watch" }));
    expect(item.status).toBe("watch");
  });
  it("maps reject signal to rejected", () => {
    const item = edgeSignalToReviewItem(signal({ severity: "reject" }));
    expect(item.status).toBe("rejected");
  });
  it("always includes universal verification gates", () => {
    const item = edgeSignalToReviewItem(signal());
    expect(item.verificationChecklist).toContain("Same event verified");
    expect(item.verificationChecklist).toContain("Odds verified live");
    expect(item.verificationChecklist).toContain("Settlement source identified");
  });
  it("includes middle-specific checklist items", () => {
    const item = edgeSignalToReviewItem(signal({ type: "line_split_middle" }));
    expect(item.verificationChecklist).toContain("Middle corridor modeled");
    expect(item.verificationChecklist).toContain("Push scenario modeled");
  });
  it("includes exchange watch-specific checklist items", () => {
    const item = edgeSignalToReviewItem(signal({ type: "exchange_stale_liquidity_watch", severity: "watch" }));
    expect(item.verificationChecklist).toContain("Confirm taking liquidity, not making liquidity");
    expect(item.verificationChecklist).toContain("Confirm fee-adjusted odds");
    expect(item.verificationChecklist).toContain("Confirm partial-fill assumptions");
  });
  it("includes soft-book lag checklist items", () => {
    const item = edgeSignalToReviewItem(signal({ type: "soft_book_lag_watch", severity: "watch" }));
    expect(item.verificationChecklist).toContain("Confirm soft-book slip accepted or paper-accepted");
    expect(item.verificationChecklist).toContain("Confirm odds-change behavior");
  });
  it("includes do-not-lock item on rejection signal", () => {
    const item = edgeSignalToReviewItem(signal({ type: "market_mismatch_reject", severity: "reject" }));
    expect(item.verificationChecklist).toContain("Do not paper lock");
  });
  it("dedupes source names", () => {
    const item = edgeSignalToReviewItem(
      signal({
        markets: [market({ source: "novig" }), market({ source: "novig", side: "Under" }), market({ source: "bovada" })],
      }),
    );
    expect(item.sourceNames).toEqual(["novig", "bovada"]);
  });
  it("does not throw when player is missing for non-player market", () => {
    const item = edgeSignalToReviewItem(
      signal({
        markets: [market({ market_type: "moneyline", player: undefined })],
      }),
    );
    expect(item.player).toBeNull();
  });
  it("adds PaperEdge prosecutor rules to review items", () => {
    const item = edgeSignalToReviewItem(signal());
    expect(item.prosecutorRules.mechanism).toBeTruthy();
    expect(item.prosecutorRules.responsibleParticipant).toBeTruthy();
    expect(item.prosecutorRules.limitToArbitrage).toBeTruthy();
    expect(item.prosecutorRules.manualCapturePath).toBeTruthy();
    expect(item.prosecutorRules.killCondition).toBeTruthy();
    expect(item.summary).toContain("Candidate edge hypothesis only");
  });
  it("maps arrays with edgeSignalsToReviewItems", () => {
    const items = edgeSignalsToReviewItems([signal({ id: "sig-a" }), signal({ id: "sig-b" })]);
    expect(items).toHaveLength(2);
    expect(items[0].signalId).toBe("sig-a");
    expect(items[1].signalId).toBe("sig-b");
  });
});