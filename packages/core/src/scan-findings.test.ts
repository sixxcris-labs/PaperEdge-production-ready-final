import { describe, expect, it } from "vitest";
import {
  buildRankedFindings,
  expectedValuePerUnit,
  parseArbFindings,
  parseComparisonBoard,
  parseCsvRecords,
  parseValueFindings,
  rankFindings,
  rateArb,
  scoreFinding,
  summarizeFindings,
} from "./scan-findings";

const ARB_HEADER =
  "classification,sport,league,event,market,player,period,side_a,line_a,book_a,odds_a,side_b,line_b,book_b,odds_b,combined_implied,reason";

const VALUE_HEADER = "book,market,outcome,offered_prob,fair_prob,edge,reference_books";

describe("parseCsvRecords", () => {
  it("handles quoted fields containing commas", () => {
    const csv = 'a,b\n"x,y","z"';
    expect(parseCsvRecords(csv)).toEqual([{ a: "x,y", b: "z" }]);
  });

  it("handles escaped double-quotes", () => {
    const csv = 'a\n"he said ""hi"""';
    expect(parseCsvRecords(csv)).toEqual([{ a: 'he said "hi"' }]);
  });

  it("returns empty for header-only input", () => {
    expect(parseCsvRecords("a,b\n")).toEqual([]);
  });
});

describe("parseArbFindings", () => {
  it("keeps true arbs and rates ROE/grade, skips not_arb", () => {
    const csv = [
      ARB_HEADER,
      // combined 0.98 -> ROE ~2.04% -> grade A (KB sweet spot 1-3%).
      '"true_arb_candidate","basketball","nba","a @ b","moneyline","","full_game","a","","bovada","+120","b","","novig","-105","0.98","opp"',
      '"not_arb","basketball","nba","a @ b","moneyline","","full_game","a","","bovada","-125","b","","4c","116","1.018","opp"',
    ].join("\n");
    const findings = parseArbFindings(csv);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.kind).toBe("arb");
    expect(f.tradeType).toBe("pure_arb");
    expect(f.roe).toBeCloseTo(1 / 0.98 - 1, 6);
    expect(f.edge).toBeCloseTo(1 / 0.98 - 1, 6); // headline edge = ROE
    expect(f.grade).toBe("A");
    expect(f.actNow).toBe(true); // grade-A arbs are act-now
    expect(f.books).toEqual(["bovada", "novig"]);
    expect(f.legs).toHaveLength(2);
  });

  it("rates a marginal (<1% ROE) arb as grade C, not act-now", () => {
    const csv = [
      ARB_HEADER,
      '"true_arb_candidate","b","nba","a @ b","moneyline","","full_game","a","","x","+100","b","","y","-101","0.998","opp"',
    ].join("\n");
    const f = parseArbFindings(csv)[0];
    expect(f.roe).toBeCloseTo(1 / 0.998 - 1, 6);
    expect(f.grade).toBe("C"); // <1% ROE -> friction may erase it
    expect(f.actNow).toBe(false);
  });

  it("rates a suspect (>5% ROE) arb as grade C with a verify flag", () => {
    const csv = [
      ARB_HEADER,
      // combined 0.875 -> ROE ~14% -> almost always a stale line / mismatch.
      '"true_arb_candidate","b","nba","a @ b","spread","","full_game","a","-3.5","bovada","+225","b","3.5","4c","-131","0.875","opp"',
    ].join("\n");
    const f = parseArbFindings(csv)[0];
    expect(f.grade).toBe("C");
    expect(f.actNow).toBe(false);
    expect(f.flags).toContain("verify_suspect_roe");
  });

  it("classifies middles separately with no locked edge", () => {
    const csv = [
      ARB_HEADER,
      '"middle_candidate","b","nba","a @ b","spread","","full_game","a","-3.5","x","-110","b","+4.5","y","-110","","split"',
    ].join("\n");
    const f = parseArbFindings(csv)[0];
    expect(f.kind).toBe("middle");
    expect(f.edge).toBe(0);
    expect(f.actNow).toBe(false);
  });
});

describe("parseValueFindings", () => {
  it("parses pipe market key and flags large edges as act-now", () => {
    const csv = [
      VALUE_HEADER,
      '"novig","basketball|nba|thunder vs spurs|moneyline||full_game|na","thunder",0.44,0.48,0.04,2',
    ].join("\n");
    const f = parseValueFindings(csv)[0];
    expect(f.kind).toBe("value");
    expect(f.sport).toBe("basketball");
    expect(f.market).toBe("moneyline");
    expect(f.selection).toBe("thunder");
    expect(f.edge).toBeCloseTo(0.04, 6);
    expect(f.actNow).toBe(true);
  });

  it("computes EV per $1 from fair and offered probabilities (KB example)", () => {
    // +150 -> offered implied 0.40; believed fair 0.45 -> +$12.50 per $100.
    expect(expectedValuePerUnit(0.45, 0.4)).toBeCloseTo(0.125, 6);
    // Fair below offered -> negative EV.
    expect(expectedValuePerUnit(0.35, 0.4)!).toBeLessThan(0);
    // Degenerate inputs -> null.
    expect(expectedValuePerUnit(0.5, 0)).toBeNull();
    expect(expectedValuePerUnit(0.5, 1)).toBeNull();
  });

  it("surfaces EV on a value finding", () => {
    const csv = [
      VALUE_HEADER,
      '"novig","basketball|nba|thunder vs spurs|moneyline||full_game|na","thunder",0.40,0.45,0.05,2',
    ].join("\n");
    const f = parseValueFindings(csv)[0];
    expect(f.ev).toBeCloseTo(0.125, 6);
    expect(f.metric).toContain("EV");
  });

  it("drops zero or negative edges", () => {
    const csv = [
      VALUE_HEADER,
      '"x","s|l|e|moneyline||full_game|na","o",0.5,0.49,-0.01,1',
      '"x","s|l|e|moneyline||full_game|na","o",0.5,0.50,0.0,1',
    ].join("\n");
    expect(parseValueFindings(csv)).toHaveLength(0);
  });
});

describe("scoreFinding / ranking", () => {
  it("ranks arbs above value above middles", () => {
    expect(scoreFinding("arb", 0.02)).toBeGreaterThan(scoreFinding("value", 0.02));
    expect(scoreFinding("value", 0.02)).toBeGreaterThan(scoreFinding("middle", 0));
  });

  it("orders a mixed list best to worst", () => {
    const arbsCsv = [
      ARB_HEADER,
      '"true_arb_candidate","b","nba","a @ b","moneyline","","full_game","a","","x","+120","b","","y","-105","0.97","opp"',
      '"middle_candidate","b","nba","c @ d","spread","","full_game","c","-3.5","x","-110","d","+4.5","y","-110","","split"',
    ].join("\n");
    const valueCsv = [
      VALUE_HEADER,
      '"x","s|l|e|moneyline||full_game|na","o",0.44,0.46,0.02,2',
    ].join("\n");
    const ranked = buildRankedFindings({ arbsCsv, valueCsv });
    expect(ranked.map((f) => f.kind)).toEqual(["arb", "value", "middle"]);
  });
});

describe("rateArb (KB logic)", () => {
  const base = { classification: "true_arb_candidate", bookA: "bovada", bookB: "4c" };

  it("grades 1-3% ROE as A (capturable sweet spot)", () => {
    const r = rateArb({ ...base, combinedImplied: 0.98 });
    expect(r.tradeType).toBe("pure_arb");
    expect(r.grade).toBe("A");
    expect(r.roe).toBeCloseTo(1 / 0.98 - 1, 6);
    expect(r.holdPct).toBeCloseTo(-0.02, 6);
  });

  it("grades 3-5% ROE as B with a verify flag (rare/harder to execute)", () => {
    const r = rateArb({ ...base, combinedImplied: 0.958 }); // ROE ~4.4%
    expect(r.grade).toBe("B");
    expect(r.flags).toContain("verify_uncommon_roe");
  });

  it("grades >5% ROE as C and flags it suspect (likely stale/mismatch)", () => {
    const r = rateArb({ ...base, combinedImplied: 0.9 }); // ROE ~11%
    expect(r.grade).toBe("C");
    expect(r.flags).toContain("verify_suspect_roe");
  });

  it("treats a non-clearing same-line pair as a low-hold move", () => {
    const r = rateArb({ ...base, classification: "not_arb", combinedImplied: 1.02 });
    expect(r.tradeType).toBe("low_hold");
    expect(r.grade).toBe("D");
    expect(r.holdPct).toBeCloseTo(0.02, 6);
  });

  it("uses exchange liquidity as the max stake", () => {
    const r = rateArb({ ...base, combinedImplied: 0.98, liquidityA: 5000, liquidityB: 800 });
    expect(r.maxStake).toBe(800);
  });

  it("marks an exchange leg with no size as not executable -> F", () => {
    const r = rateArb({ ...base, bookB: "novig", combinedImplied: 0.98, liquidityB: 0 });
    expect(r.executable).toBe(false);
    expect(r.grade).toBe("F");
    expect(r.flags).toContain("illiquid:novig");
  });

  it("flags a fee book leg (prophetx) and penalizes the score", () => {
    const withFee = rateArb({ ...base, bookB: "prophetx", combinedImplied: 0.98, liquidityA: 1000, liquidityB: 1000 });
    const noFee = rateArb({ ...base, combinedImplied: 0.98, liquidityA: 1000, liquidityB: 1000 });
    expect(withFee.flags).toContain("exchange_fee");
    expect(withFee.score).toBeLessThan(noFee.score);
  });
});

describe("parseComparisonBoard", () => {
  const HEADER =
    "selection,bovada_american,novig_american,4c_american,rebet_american,prophetx_american,book_count,best_book,implied_gap";

  it("parses per-book odds and sorts by widest gap", () => {
    const csv = [
      HEADER,
      '"basketball|nba|thunder vs spurs|moneyline||full_game|na|spurs",-125,,-116,,,2,4c,0.0185',
      '"basketball|nba|thunder vs spurs|total||full_game|218|under",-110,,101,,,2,4c,0.0263',
    ].join("\n");
    const rows = parseComparisonBoard(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].gap).toBeCloseTo(0.0263, 6); // widest first
    expect(rows[0].market).toBe("total");
    expect(rows[0].selection).toBe("under");
    expect(rows[0].detail).toContain("218");
    expect(rows[0].odds.bovada).toBe("-110");
    expect(rows[0].odds["4c"]).toBe("+101");
    expect(rows[0].odds.novig).toBe(""); // no price
    expect(rows[0].bestBook).toBe("4c");
    expect(rows[0].bookCount).toBe(2);
  });
});

describe("summarizeFindings", () => {
  it("counts by kind and finds the top edge", () => {
    const ranked = rankFindings([
      ...parseArbFindings(
        [
          ARB_HEADER,
          '"true_arb_candidate","b","nba","a @ b","moneyline","","full_game","a","","x","+120","b","","y","-105","0.98","opp"',
        ].join("\n"),
      ),
      ...parseValueFindings(
        [
          VALUE_HEADER,
          '"x","s|l|e|moneyline||full_game|na","o",0.44,0.46,0.02,2',
        ].join("\n"),
      ),
    ]);
    const s = summarizeFindings(ranked);
    expect(s.total).toBe(2);
    expect(s.arbs).toBe(1);
    expect(s.value).toBe(1);
    expect(s.actNow).toBe(1); // grade-A arb
    expect(s.topEdge).toBeCloseTo(1 / 0.98 - 1, 6); // ROE of the arb
  });
});
