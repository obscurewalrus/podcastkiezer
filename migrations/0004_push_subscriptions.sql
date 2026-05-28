-- Push-subscriptions per browser. `endpoint` is uniek per subscription;
-- meerdere browsers van dezelfde voter hebben elk hun eigen rij.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  voter_id    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  last_sent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_voter ON push_subscriptions(voter_id);
