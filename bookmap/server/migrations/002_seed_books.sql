-- 30 books per OddsFlex tier system. URLs left empty where not confidently known.
-- created_at uses a fixed sentinel; actual updated_at is set per-row at seed time in code.

INSERT OR IGNORE INTO books (id, name, url, tier, role, category, created_at) VALUES
  ('draftkings',          'DraftKings',          'https://sportsbook.draftkings.com',  'core',     'Primary US sportsbook + DFS anchor',                 'domestic',      datetime('now')),
  ('novig',               'Novig',               'https://novig.us',                   'core',     'P2P exchange, no-vig pricing',                       'exchange',      datetime('now')),
  ('prophetx',            'Prophet X',           'https://prophetexchange.com',        'core',     'Betting exchange, sharper pricing',                  'exchange',      datetime('now')),

  ('onyxodds',            'Onyx Odds',           '',                                   'next',     'Reduced-vig book',                                   'domestic',      datetime('now')),
  ('kalshi',              'Kalshi',              'https://kalshi.com',                 'next',     'Event-prediction exchange (CFTC regulated)',         'prediction',    datetime('now')),
  ('fliff',               'Fliff',               'https://www.getfliff.com',           'next',     'Sweeps social sportsbook',                           'social',        datetime('now')),

  ('rebet',               'Rebet',               '',                                   'test',     'Peer-to-peer challenges',                            'social',        datetime('now')),
  ('sportzino',           'Sportzino',           '',                                   'test',     'Sweeps sportsbook',                                  'social',        datetime('now')),
  ('4cx',                 '4CX',                 '',                                   'test',     'Crypto / experimental exchange',                     'experimental',  datetime('now')),
  ('betopenly',           'BetOpenly',           '',                                   'test',     'Exchange-style book',                                'exchange',      datetime('now')),
  ('thrillzz',            'Thrillzz',            '',                                   'test',     'Sweeps social book',                                 'social',        datetime('now')),

  ('dk-predictions',      'DraftKings Predictions','',                                 'optional', 'Event prediction product',                           'prediction',    datetime('now')),
  ('fanatics-markets',    'Fanatics Markets',    '',                                   'optional', 'Event markets product',                              'prediction',    datetime('now')),
  ('polymarket',          'Polymarket',          'https://polymarket.com',             'optional', 'Crypto event market',                                'prediction',    datetime('now')),
  ('robinhood',           'Robinhood',           'https://robinhood.com',              'optional', 'Event contracts via brokerage',                      'prediction',    datetime('now')),
  ('crypto-com',          'Crypto.com',          'https://crypto.com',                 'optional', 'Crypto on-ramp / event markets',                     'bank',          datetime('now')),
  ('betr',                'Betr',                '',                                   'optional', 'Micro-betting book',                                 'domestic',      datetime('now')),
  ('courtside',           'Courtside',           '',                                   'optional', 'Social / P2P product',                               'social',        datetime('now')),
  ('dogghouse',           'Dogg House',          '',                                   'optional', 'Sweeps social book',                                 'social',        datetime('now')),

  ('fanduel',             'FanDuel',             'https://sportsbook.fanduel.com',     'lowprio',  'Major US sportsbook (low priority in NH)',           'domestic',      datetime('now')),
  ('betmgm',              'BetMGM',              'https://sports.betmgm.com',          'lowprio',  'Major US sportsbook (low priority in NH)',           'domestic',      datetime('now')),
  ('caesars',             'Caesars',             'https://www.caesars.com/sportsbook', 'lowprio',  'Major US sportsbook (low priority in NH)',           'domestic',      datetime('now')),
  ('betrivers',           'BetRivers',           'https://www.betrivers.com',          'lowprio',  'Regional US sportsbook',                             'domestic',      datetime('now')),

  ('bovada',              'Bovada',              'https://www.bovada.lv',              'later',    'Offshore — consider later only',                     'offshore',      datetime('now')),
  ('betonline',           'BetOnline',           'https://www.betonline.ag',           'later',    'Offshore — consider later only',                     'offshore',      datetime('now')),
  ('bookmaker',           'BookMaker',           '',                                   'later',    'Offshore — consider later only',                     'offshore',      datetime('now')),
  ('betus',               'BetUS',               '',                                   'later',    'Offshore — consider later only',                     'offshore',      datetime('now')),
  ('jazzsports',          'Jazz Sports',         '',                                   'later',    'Offshore — consider later only',                     'offshore',      datetime('now')),

  ('mybookie',            'MyBookie',            '',                                   'avoid',    'Avoid early — reputation concerns',                  'offshore',      datetime('now')),
  ('crypto-grey',         '1XBet / 22Bet / BC.GAME / Stake', '',                       'avoid',    'Avoid early — grey-market crypto books',             'offshore',      datetime('now'));

-- Initialize a book_state row for each book
INSERT OR IGNORE INTO book_state (book_id, status, updated_at)
SELECT id, 'verify', datetime('now') FROM books;
