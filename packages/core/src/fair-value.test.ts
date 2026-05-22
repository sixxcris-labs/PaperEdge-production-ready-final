import { describe, expect, it } from "vitest";
import {
  type BookQuote,
  devig,
  devigTwoWay,
  fairConsensus,
  findValueEdges,
  overround,
} from "./fair-value";

describe("devig", () => {
  it("computes the overround of a two-way market", () => {
    expect(overround([0.55, 0.52])).toBeCloseTo(1.07, 6);
  });

  it("proportional de-vig sums to 1 and preserves ratios", () => {
    const fair = devig([0.6, 0.6]);
    expect(fair[0]).toBeCloseTo(0.5, 6);
    expect(fair[1]).toBeCloseTo(0.5, 6);

    const skew = devig([0.7, 0.5]); // sum 1.2
    expect(skew[0] + skew[1]).toBeCloseTo(1, 6);
    expect(skew[0]).toBeCloseTo(0.5833, 3);
  });

  it("additive de-vig sums to 1 and differs from proportional when skewed", () => {
    const prop = devig([0.7, 0.5], "proportional");
    const add = devig([0.7, 0.5], "additive");
    expect(add[0] + add[1]).toBeCloseTo(1, 6);
    expect(add[0]).toBeCloseTo(0.6, 6); // 0.7 - (0.2/2)
    expect(add[0]).not.toBeCloseTo(prop[0], 3);
  });

  it("returns NaN for invalid inputs", () => {
    expect(devig([0, 0.5]).every(Number.isNaN)).toBe(true);
    expect(devigTwoWay(Number.NaN, 0.5).a).toBeNaN();
  });
});

const market = "ml";
function q(source: string, outcome: string, p: number): BookQuote {
  return { source, market, outcome, impliedProbability: p };
}

// Books A and B are tight; book C prices "home" cheap (0.48) -> +EV on home.
const quotes: BookQuote[] = [
  q("a", "home", 0.55),
  q("a", "away", 0.52),
  q("b", "home", 0.54),
  q("b", "away", 0.53),
  q("c", "home", 0.48),
  q("c", "away", 0.58),
];

describe("fairConsensus", () => {
  it("produces a fair probability per outcome that sums near 1", () => {
    const consensus = fairConsensus(quotes);
    const home = consensus.find((c) => c.outcome === "home")!;
    const away = consensus.find((c) => c.outcome === "away")!;
    expect(home.bookCount).toBe(3);
    expect(home.fairProbability + away.fairProbability).toBeCloseTo(1, 2);
  });
});

describe("findValueEdges", () => {
  it("flags the off-market book/outcome as +EV vs leave-one-out consensus", () => {
    const edges = findValueEdges(quotes, { minEdge: 0 });
    const top = edges[0];
    expect(top.source).toBe("c");
    expect(top.outcome).toBe("home");
    expect(top.edge).toBeGreaterThan(0.04);
    expect(top.referenceBooks).toBe(2);
  });

  it("does not flag the overpriced side as value", () => {
    const edges = findValueEdges(quotes, { minEdge: 0 });
    expect(edges.some((e) => e.source === "c" && e.outcome === "away")).toBe(false);
  });

  it("respects minEdge threshold", () => {
    expect(findValueEdges(quotes, { minEdge: 0.5 })).toEqual([]);
  });

  it("returns nothing when only one book is present (no reference)", () => {
    expect(findValueEdges([q("a", "home", 0.55), q("a", "away", 0.52)])).toEqual([]);
  });

  it("dedupes duplicate listings per book to a single best-priced edge", () => {
    // book c lists "home" twice (0.48 and a worse 0.50); only the best should be evaluated once
    const withDup = [...quotes, q("c", "home", 0.5)];
    const edges = findValueEdges(withDup, { minEdge: 0 });
    const cHome = edges.filter((e) => e.source === "c" && e.outcome === "home");
    expect(cHome).toHaveLength(1);
    expect(cHome[0].offeredProbability).toBe(0.48);
  });
});
