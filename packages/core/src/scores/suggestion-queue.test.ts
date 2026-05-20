import { describe, expect, it } from "vitest";
import { groupSettlementSuggestions } from "./suggestion-queue";

describe("groupSettlementSuggestions", () => {
  it("groups pending suggestions by confidence tier", () => {
    const grouped = groupSettlementSuggestions([
      { id: "high", tier: "A", confidence: 0.97, status: "pending" },
      { id: "review", tier: "B", confidence: 0.62, status: "pending" },
      { id: "manual", tier: "C", confidence: 0.2, status: "pending" },
      { id: "ignored", tier: "A", confidence: 0.95, status: "confirmed" },
    ]);

    expect(grouped.highConfidence.map((item) => item.id)).toEqual(["high"]);
    expect(grouped.needsReview.map((item) => item.id)).toEqual(["review"]);
    expect(grouped.manual.map((item) => item.id)).toEqual(["manual"]);
  });
});
