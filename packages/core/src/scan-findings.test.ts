import { describe, expect, it } from "vitest";
import {
  ACT_NOW,
  buildRankedFindings,
  parseArbFindings,
  parseComparisonBoard,
  parseCsvRecords,
  parseValueFindings,
  rankFindings,
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
  it("keeps true arbs and computes locked margin, skips not_arb", () => {
    const csv = [
      ARB_HEADER,
      '"true_arb_candidate","basketball","nba","a @ b","moneyline","","full_game","a","","bovada","+120","b","","novig","-105","0.97","opp"',
      '"not_arb","basketball","nba","a @ b","moneyline","","full_game","a","","bovada","-125","b","","4c","116","1.018","opp"',
    ].join("\n");
    const findings = parseArbFindings(csv);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.kind).toBe("arb");
    expect(f.edge).toBeCloseTo(0.03, 6);
    expect(f.actNow).toBe(true);
    expect(f.books).toEqual(["bovada", "novig"]);
    expect(f.legs).toHaveLength(2);
  });

  it("marks a tiny arb margin as not act-now", () => {
    const csv = [
      ARB_HEADER,
      '"true_arb_candidate","b","nba","a @ b","moneyline","","full_game","a","","x","+100","b","","y","-101","0.998","opp"',
    ].join("\n");
    const f = parseArbFindings(csv)[0];
    expect(f.edge).toBeCloseTo(0.002, 6);
    expect(f.edge).toBeLessThan(ACT_NOW.arbMinMargin);
    expect(f.actNow).toBe(false);
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
          '"true_arb_candidate","b","nba","a @ b","moneyline","","full_game","a","","x","+120","b","","y","-105","0.97","opp"',
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
    expect(s.actNow).toBe(1);
    expect(s.topEdge).toBeCloseTo(0.03, 6);
  });
});
