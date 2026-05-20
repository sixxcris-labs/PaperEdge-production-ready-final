import { describe, expect, it } from "vitest";
import { parseSideString } from "./side-string";

describe("parseSideString", () => {
  it("parses tennis spread sides with signed lines", () => {
    expect(parseSideString("Ignacio Buse +1.5")).toEqual({
      competitorName: "Ignacio Buse",
      marketType: "SPREAD",
      line: 1.5,
      confidence: 0.95,
    });

    expect(parseSideString("Mensik -1.5")).toMatchObject({
      competitorName: "Mensik",
      marketType: "SPREAD",
      line: -1.5,
    });
  });

  it("strips trailing American odds from run-line style sides", () => {
    expect(parseSideString("Yankees -1.5 (-110)")).toMatchObject({
      competitorName: "Yankees",
      marketType: "SPREAD",
      line: -1.5,
    });
  });

  it("parses moneyline aliases", () => {
    expect(parseSideString("Buse ML")).toEqual({
      competitorName: "Buse",
      marketType: "ML",
      confidence: 0.95,
    });
  });

  it("parses totals without assigning a competitor", () => {
    expect(parseSideString("Over 8.5")).toEqual({
      competitorName: "",
      marketType: "TOTAL",
      line: 8.5,
      direction: "OVER",
      confidence: 0.95,
    });
  });

  it("flags player props as out-of-scope low-confidence sides", () => {
    expect(parseSideString("Aaron Judge Over 1.5 HR")).toEqual({
      competitorName: "Aaron Judge",
      marketType: "PROP",
      line: 1.5,
      direction: "OVER",
      confidence: 0.45,
    });
  });

  it("returns unknown for unparseable sides", () => {
    expect(parseSideString("check board manually")).toEqual({
      competitorName: "check board manually",
      marketType: "UNKNOWN",
      confidence: 0.2,
    });
  });
});
