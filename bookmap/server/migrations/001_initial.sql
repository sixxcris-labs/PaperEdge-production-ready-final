CREATE TABLE IF NOT EXISTS books (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT,
  tier        TEXT NOT NULL,
  role        TEXT NOT NULL,
  category    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_state (
  book_id              TEXT PRIMARY KEY REFERENCES books(id),
  status               TEXT NOT NULL DEFAULT 'verify',
  eligible_in_state    TEXT DEFAULT 'unknown',
  balance_cents        INTEGER NOT NULL DEFAULT 0,
  rollover_cents       INTEGER NOT NULL DEFAULT 0,
  rollover_total_cents INTEGER NOT NULL DEFAULT 0,
  bonus_type           TEXT DEFAULT 'none',
  bonus_amount_cents   INTEGER NOT NULL DEFAULT 0,
  min_deposit_cents    INTEGER NOT NULL DEFAULT 0,
  withdrawal_rule      TEXT,
  verification_done    INTEGER NOT NULL DEFAULT 0,
  first_withdrawal_at  TEXT,
  notes                TEXT,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     TEXT NOT NULL REFERENCES books(id),
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_state_log_book ON state_log(book_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS user_prefs (
  key   TEXT PRIMARY KEY,
  value TEXT
);
