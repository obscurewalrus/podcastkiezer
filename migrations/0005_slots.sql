-- Twee slots per dag: 'morning' en 'afternoon'. SQLite kan een primary
-- key niet in-place wijzigen, dus we herbouwen de vier tabellen met een
-- slot-kolom en composite PK. Bestaande rijen waren single-slot (ochtend-
-- achtig model) en krijgen slot = 'morning'.
--
-- Geen foreign keys in dit schema, dus de drop/rename-volgorde is vrij.

-- polls
CREATE TABLE polls_new (
  date        TEXT NOT NULL,
  slot        TEXT NOT NULL DEFAULT 'morning',
  created_at  TEXT NOT NULL,
  question    TEXT NOT NULL,
  missing     TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (date, slot)
);
INSERT INTO polls_new (date, slot, created_at, question, missing)
  SELECT date, 'morning', created_at, question, missing FROM polls;
DROP TABLE polls;
ALTER TABLE polls_new RENAME TO polls;

-- poll_options
CREATE TABLE poll_options_new (
  poll_date     TEXT NOT NULL,
  slot          TEXT NOT NULL DEFAULT 'morning',
  letter        TEXT NOT NULL,
  source        TEXT NOT NULL,
  title         TEXT NOT NULL,
  link          TEXT,
  duration_sec  INTEGER,
  artwork_url   TEXT,
  PRIMARY KEY (poll_date, slot, letter)
);
INSERT INTO poll_options_new (poll_date, slot, letter, source, title, link, duration_sec, artwork_url)
  SELECT poll_date, 'morning', letter, source, title, link, duration_sec, artwork_url FROM poll_options;
DROP TABLE poll_options;
ALTER TABLE poll_options_new RENAME TO poll_options;

-- votes
CREATE TABLE votes_new (
  poll_date   TEXT NOT NULL,
  slot        TEXT NOT NULL DEFAULT 'morning',
  voter_id    TEXT NOT NULL,
  letter      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (poll_date, slot, voter_id)
);
INSERT INTO votes_new (poll_date, slot, voter_id, letter, created_at)
  SELECT poll_date, 'morning', voter_id, letter, created_at FROM votes;
DROP TABLE votes;
ALTER TABLE votes_new RENAME TO votes;
CREATE INDEX IF NOT EXISTS idx_votes_by_poll ON votes(poll_date, slot, letter);

-- voter_reveals
CREATE TABLE voter_reveals_new (
  poll_date    TEXT NOT NULL,
  slot         TEXT NOT NULL DEFAULT 'morning',
  voter_id     TEXT NOT NULL,
  revealed_at  TEXT NOT NULL,
  PRIMARY KEY (poll_date, slot, voter_id)
);
INSERT INTO voter_reveals_new (poll_date, slot, voter_id, revealed_at)
  SELECT poll_date, 'morning', voter_id, revealed_at FROM voter_reveals;
DROP TABLE voter_reveals;
ALTER TABLE voter_reveals_new RENAME TO voter_reveals;
