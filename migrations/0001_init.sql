-- Schema voor de podcastkiezer-stemdatabase.

CREATE TABLE IF NOT EXISTS polls (
  date        TEXT PRIMARY KEY,           -- YYYY-MM-DD, in Europe/Amsterdam
  created_at  TEXT NOT NULL,              -- ISO 8601 UTC
  question    TEXT NOT NULL,
  missing     TEXT NOT NULL DEFAULT '[]'  -- JSON-array van bronnamen zonder aflevering
);

CREATE TABLE IF NOT EXISTS poll_options (
  poll_date     TEXT NOT NULL,
  letter        TEXT NOT NULL,            -- A, B, C, D, ...
  source        TEXT NOT NULL,            -- "NRC Vandaag", "De Dag (NOS)", ...
  title         TEXT NOT NULL,
  link          TEXT,
  duration_sec  INTEGER,
  PRIMARY KEY (poll_date, letter)
);

CREATE TABLE IF NOT EXISTS votes (
  poll_date   TEXT NOT NULL,
  voter_id    TEXT NOT NULL,              -- random UUID per browser, in een cookie
  letter      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (poll_date, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_by_poll ON votes(poll_date, letter);
