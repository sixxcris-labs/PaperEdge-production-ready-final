export type Tier = "core" | "next" | "test" | "optional" | "lowprio" | "later" | "avoid";
export type Status = "verify" | "registered" | "funded" | "paused" | "avoid";
export type BonusType = "none" | "cash" | "promo" | "deposit_match" | "reload" | "signup";
export type Eligible = "unknown" | "yes" | "no";

export interface Book {
  id: string;
  name: string;
  url: string | null;
  tier: Tier;
  role: string;
  category: string;
  created_at: string;

  status: Status;
  eligible_in_state: Eligible | null;
  balance_cents: number;
  rollover_cents: number;
  rollover_total_cents: number;
  bonus_type: BonusType | null;
  bonus_amount_cents: number;
  min_deposit_cents: number;
  withdrawal_rule: string | null;
  verification_done: number;
  first_withdrawal_at: string | null;
  notes: string | null;
  updated_at: string;
}

export interface LogEntry {
  id: number;
  book_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface Summary {
  funded_count: number;
  total_balance: number;
  total_rollover: number;
  books_with_rollover: number;
}

export const TIER_ORDER: Tier[] = ["core", "next", "test", "optional", "lowprio", "later", "avoid"];

export const TIER_LABEL: Record<Tier, string> = {
  core: "Core 3",
  next: "Add Next",
  test: "Test Small Later",
  optional: "Optional",
  lowprio: "Low Priority in NH",
  later: "Later (Offshore)",
  avoid: "Avoid Early",
};
