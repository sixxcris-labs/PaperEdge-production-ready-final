export interface SettlementSuggestionQueueItem {
  id: string;
  tier: string;
  confidence: number;
  status: string;
}

export interface GroupedSettlementSuggestions<T extends SettlementSuggestionQueueItem> {
  highConfidence: T[];
  needsReview: T[];
  manual: T[];
}

export function groupSettlementSuggestions<T extends SettlementSuggestionQueueItem>(
  suggestions: T[],
): GroupedSettlementSuggestions<T> {
  const pending = suggestions.filter((suggestion) => suggestion.status === "pending");
  return {
    highConfidence: pending.filter((suggestion) => suggestion.tier === "A" || suggestion.confidence >= 0.85),
    needsReview: pending.filter(
      (suggestion) => suggestion.tier === "B" || (suggestion.confidence >= 0.5 && suggestion.confidence < 0.85),
    ),
    manual: pending.filter((suggestion) => suggestion.tier === "C" || suggestion.confidence < 0.5),
  };
}
