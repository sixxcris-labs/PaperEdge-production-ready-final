import { describe, expect, it } from "vitest";

import { normalizeFourCMarkets } from "./fourc";

const raw = {
  data: {
    game: {
      id: "game-1",
      eventName: "OKLAHOMA CITY THUNDER VS SAN ANTONIO SPURS",
      league: "NBA",
      sport: "basketball",
      live: false,
      ended: false,
      periodName: "Full Time",
      participants: [
        { id: "p-away", longName: "Oklahoma City Thunder", homeAway: "away" },
        { id: "p-home", longName: "San Antonio Spurs", homeAway: "home" },
      ],
      awayMoneylines: [
        {
          id: "ml-away-1",
          participantID: "p-away",
          odds: 113,
          sumUntaken: 508.84,
          createdAt: "2026-05-22T03:29:16.282Z",
        },
      ],
      homeMoneylines: [
        {
          id: "ml-home-1",
          participantID: "p-home",
          odds: -121,
          sumUntaken: 548.13,
          createdAt: "2026-05-22T08:25:29.230Z",
        },
      ],
      awaySpreads: {
        "2.5": [
          {
            id: "sp-away-1",
            participantID: "p-away",
            odds: -110,
            spread: 2.5,
            sumUntaken: 320,
            createdAt: "2026-05-22T08:00:00.000Z",
          },
        ],
      },
      homeSpreads: {
        "-2.5": [
          {
            id: "sp-home-1",
            participantID: "p-home",
            odds: -110,
            spread: -2.5,
            sumUntaken: 330,
            createdAt: "2026-05-22T08:00:00.000Z",
          },
        ],
      },
      over: {
        "218.5": [
          {
            id: "tot-over-1",
            odds: -108,
            total: 218.5,
            sumUntaken: 410,
            createdAt: "2026-05-22T09:00:00.000Z",
          },
        ],
      },
      under: {
        "218.5": [
          {
            id: "tot-under-1",
            odds: -112,
            total: 218.5,
            sumUntaken: 415,
            createdAt: "2026-05-22T09:00:01.000Z",
          },
        ],
      },
    },
  },
};

describe("normalizeFourCMarkets", () => {
  it("normalizes 4c moneyline/spread/total offers into rows", () => {
    const rows = normalizeFourCMarkets(raw);
    expect(rows.length).toBe(6);
  });

  it("sets source as 4c", () => {
    const [row] = normalizeFourCMarkets(raw);
    expect(row.source).toBe("4c");
  });

  it("maps moneyline participant side and null line", () => {
    const rows = normalizeFourCMarkets(raw);
    const ml = rows.find((row) => row.sourceOutcomeId === "ml-away-1");
    expect(ml?.market_type).toBe("moneyline");
    expect(ml?.side).toBe("oklahoma city thunder");
    expect(ml?.line).toBeNull();
  });

  it("maps spread and total lines", () => {
    const rows = normalizeFourCMarkets(raw);
    const spread = rows.find((row) => row.sourceOutcomeId === "sp-home-1");
    const total = rows.find((row) => row.sourceOutcomeId === "tot-over-1");
    expect(spread?.market_type).toBe("spread");
    expect(spread?.line).toBe(-2.5);
    expect(total?.market_type).toBe("total");
    expect(total?.line).toBe(218.5);
    expect(total?.side).toBe("over");
  });

  it("maps odds, liquidity, and timestamps", () => {
    const rows = normalizeFourCMarkets(raw);
    const row = rows.find((item) => item.sourceOutcomeId === "ml-home-1");
    expect(row?.odds_american).toBe(-121);
    expect(row?.liquidity).toBe(548.13);
    expect(row?.timestamp).toBe("2026-05-22t08:25:29.230z");
  });

  it("derives event and status from game context", () => {
    const [row] = normalizeFourCMarkets(raw);
    expect(row.event_id).toBe("game-1");
    expect(row.event_name).toBe("oklahoma city thunder vs san antonio spurs");
    expect(row.status).toBe("open");
  });

  it("normalizes full-time period aliases to full_game", () => {
    const rows = normalizeFourCMarkets({
      data: {
        game: {
          ...raw.data.game,
          periodName: "Full-Time",
        },
      },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.period === "full_game")).toBe(true);
  });
});
