import type { NormalizedScore } from "../providers/types";

export interface ScoreTradeLeg {
  side: string;
  lineValue?: number | null;
  marketType?: string | null;
  player?: string | null;
  team?: string | null;
}

export interface LegResult {
  won: boolean | "push";
  confidence: number;
  reason: string;
  warnings: string[];
}

export interface Parser<Leg extends ScoreTradeLeg = ScoreTradeLeg> {
  sport: string;
  parseLeg(leg: Leg, score: NormalizedScore): LegResult;
}
