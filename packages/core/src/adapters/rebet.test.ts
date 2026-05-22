import { describe, expect, it } from "vitest";

import { normalizeRebetMarkets } from "./rebet";

const raw = {
  data: {
    id: "sr:match:70505036",
    sport_name: "Basketball",
    league_name: "NBA",
    scheduled_ts: "1779496200.0",
    is_live: false,
    competitors: [
      { name: "San Antonio Spurs", qualifier: "home" },
      { name: "Oklahoma City Thunder", qualifier: "away" },
    ],
    market_data: [
      {
        cards: [
          {
            card_name: "Game Line",
            markets: [
              {
                id: "219",
                name: "Winner (incl. overtime)",
                status: "1",
                outcome: [
                  {
                    id: "5",
                    name: "Oklahoma City Thunder",
                    probabilities: "0.470136",
                    display_odds: { american: "+102", decimal: "2.02" },
                    active: "1",
                  },
                  {
                    id: "6",
                    name: "San Antonio Spurs",
                    probabilities: "0.529864",
                    display_odds: { american: "-113", decimal: "1.89" },
                    active: "1",
                  },
                ],
              },
              {
                id: "225",
                name: "Total (incl. overtime)",
                status: "1",
                outcome: [
                  {
                    id: "12",
                    name: "over 217.5",
                    probabilities: "0.506423",
                    display_odds: { american: "-115", decimal: "1.87" },
                    active: "1",
                  },
                  {
                    id: "13",
                    name: "under 217.5",
                    probabilities: "0.493577",
                    display_odds: { american: "-103", decimal: "1.97" },
                    active: "1",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("normalizeRebetMarkets", () => {
  it("flattens card markets and outcomes to normalized rows", () => {
    const rows = normalizeRebetMarkets(raw);
    expect(rows.length).toBe(4);
  });

  it("sets source as rebet", () => {
    const [row] = normalizeRebetMarkets(raw);
    expect(row.source).toBe("rebet");
  });

  it("maps event and market IDs", () => {
    const [row] = normalizeRebetMarkets(raw);
    expect(row.sourceEventId).toBe("sr:match:70505036");
    expect(row.sourceMarketId).toBe("219");
    expect(row.sourceOutcomeId).toBe("5");
  });

  it("parses American odds and implied probability", () => {
    const [row] = normalizeRebetMarkets(raw);
    expect(row.odds_american).toBe(102);
    expect(row.implied_probability).toBeCloseTo(0.470136, 6);
  });

  it("extracts over/under side and line from outcome label", () => {
    const rows = normalizeRebetMarkets(raw);
    const overRow = rows.find((row) => row.sourceOutcomeId === "12");
    expect(overRow?.side).toBe("over");
    expect(overRow?.line).toBe(217.5);
    expect(overRow?.market_type).toBe("total");
  });

  it("derives event name from competitors", () => {
    const [row] = normalizeRebetMarkets(raw);
    expect(row.event_name).toBe("oklahoma city thunder @ san antonio spurs");
  });

  it("keeps rows open only when market and outcome are active", () => {
    const rows = normalizeRebetMarkets(raw);
    expect(rows.every((row) => row.status === "open")).toBe(true);
  });

  it("disambiguates player total props from the game total", () => {
    const propRaw = {
      data: {
        ...raw.data,
        market_data: [
          {
            cards: [
              {
                markets: [
                  {
                    id: "300",
                    name: "Gilgeous-Alexander, Shai total points (incl. overtime)",
                    status: "1",
                    outcome: [
                      { id: "p1", name: "over 30.5", display_odds: { american: "-110" }, active: "1" },
                      { id: "p2", name: "under 30.5", display_odds: { american: "-110" }, active: "1" },
                    ],
                  },
                  {
                    id: "301",
                    name: "Caruso, Alex total 3-point field goals (incl. overtime)",
                    status: "1",
                    outcome: [{ id: "p3", name: "over 2.5", display_odds: { american: "+120" }, active: "1" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const rows = normalizeRebetMarkets(propRaw);
    const pts = rows.find((r) => r.sourceOutcomeId === "p1")!;
    expect(pts.market_type).toBe("player_points");
    expect(pts.player).toBe("shai gilgeous-alexander");
    expect(pts.line).toBe(30.5);

    const threes = rows.find((r) => r.sourceOutcomeId === "p3")!;
    expect(threes.market_type).toBe("player_threes");
    expect(threes.player).toBe("alex caruso");

    // game total stays "total" with no player (regression guard)
    const gameTotal = rows.find((r) => r.market_type === "total");
    expect(gameTotal).toBeUndefined(); // none in this fixture
  });

  it("splits team totals, period totals, and derivatives out of the game-total bucket", () => {
    const derivedRaw = {
      data: {
        ...raw.data,
        market_data: [
          {
            cards: [
              {
                markets: [
                  // game total
                  {
                    id: "225",
                    name: "Total (incl. overtime)",
                    specifiers: "total=217.5",
                    status: "1",
                    outcome: [
                      { id: "g1", name: "over 217.5", display_odds: { american: "-110" }, active: "1" },
                      { id: "g2", name: "under 217.5", display_odds: { american: "-110" }, active: "1" },
                    ],
                  },
                  // team total
                  {
                    id: "227",
                    name: "San Antonio Spurs total (incl. overtime)",
                    specifiers: "total=109.5",
                    status: "1",
                    outcome: [
                      { id: "t1", name: "over 109.5", display_odds: { american: "-115" }, active: "1" },
                      { id: "t2", name: "under 109.5", display_odds: { american: "-105" }, active: "1" },
                    ],
                  },
                  // 1st quarter game total (period prefix + quarternr specifier)
                  {
                    id: "236",
                    name: "1st quarter - total",
                    specifiers: "quarternr=1|total=53.5",
                    status: "1",
                    outcome: [
                      { id: "q1", name: "over 53.5", display_odds: { american: "-121" }, active: "1" },
                      { id: "q2", name: "under 53.5", display_odds: { american: "-101" }, active: "1" },
                    ],
                  },
                  // 1st half team total (period prefix + team scope)
                  {
                    id: "69",
                    name: "1st half - San Antonio Spurs total",
                    specifiers: "total=53.5",
                    status: "1",
                    outcome: [
                      { id: "h1", name: "over 53.5", display_odds: { american: "-110" }, active: "1" },
                      { id: "h2", name: "under 53.5", display_odds: { american: "-110" }, active: "1" },
                    ],
                  },
                  // derivative special
                  {
                    id: "964",
                    name: "Any team total maximum consecutive points",
                    specifiers: "total=10.5",
                    status: "1",
                    outcome: [{ id: "s1", name: "over 10.5", display_odds: { american: "-188" }, active: "1" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const rows = normalizeRebetMarkets(derivedRaw);

    const gameTotal = rows.find((r) => r.sourceOutcomeId === "g1")!;
    expect(gameTotal.market_type).toBe("total");
    expect(gameTotal.player).toBeNull();
    expect(gameTotal.period).toBe("full_game");

    const teamTotal = rows.find((r) => r.sourceOutcomeId === "t1")!;
    expect(teamTotal.market_type).toBe("team_total");
    expect(teamTotal.player).toBe("san antonio spurs");
    expect(teamTotal.period).toBe("full_game");

    const quarterTotal = rows.find((r) => r.sourceOutcomeId === "q1")!;
    expect(quarterTotal.market_type).toBe("total");
    expect(quarterTotal.period).toBe("first_quarter");

    const halfTeamTotal = rows.find((r) => r.sourceOutcomeId === "h1")!;
    expect(halfTeamTotal.market_type).toBe("team_total");
    expect(halfTeamTotal.player).toBe("san antonio spurs");
    expect(halfTeamTotal.period).toBe("first_half");

    const special = rows.find((r) => r.sourceOutcomeId === "s1")!;
    expect(special.market_type).not.toBe("total");
    expect(special.market_type).toBe("max_consecutive_points");

    // Only the true game total + quarter game total share market_type "total",
    // and they are separated by period — no two distinct over/under markets
    // collide on (market_type, player, period, line).
    const keys = rows
      .filter((r) => r.side === "over")
      .map((r) => `${r.market_type}|${r.player ?? ""}|${r.period}|${r.line}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not throw when display odds are missing", () => {
    const rows = normalizeRebetMarkets({
      data: {
        ...raw.data,
        market_data: [
          {
            cards: [
              {
                markets: [
                  {
                    id: "x",
                    name: "Winner",
                    status: "1",
                    outcome: [{ id: "y", name: "Team A" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].odds_american).toBeNull();
    expect(rows[0].implied_probability).toBeNull();
  });
});
