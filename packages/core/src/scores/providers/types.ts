export interface NormalizedScore {
  sport: string;
  league?: string;
  eventId: string;
  startTime: Date;
  endTime: Date | null;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "cancelled" | "retired" | "walkover";
  competitors: NormalizedCompetitor[];
  finalScore?: NormalizedFinalScore;
  fetchedAt: Date;
  rawPayload: unknown;
}

export interface NormalizedCompetitor {
  id: string;
  name: string;
  aliases: string[];
  isHome?: boolean;
}

export interface NormalizedFinalScore {
  competitorScores: Record<string, number>;
  periods?: NormalizedScorePeriod[];
  winner?: string;
}

export interface NormalizedScorePeriod {
  name: string;
  scores: Record<string, number>;
}

export interface ScoreProvider<Trade = unknown> {
  name: string;
  supports(sport: string, league?: string): boolean;
  fetchScoreForTrade(trade: Trade): Promise<NormalizedScore | null>;
}
