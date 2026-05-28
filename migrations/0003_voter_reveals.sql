-- Onthoudt wie een poll ooit heeft "onthuld" (= ooit gestemd), zodat de
-- bronnen zichtbaar blijven nadat iemand zijn stem weer intrekt.
CREATE TABLE IF NOT EXISTS voter_reveals (
  poll_date    TEXT NOT NULL,
  voter_id     TEXT NOT NULL,
  revealed_at  TEXT NOT NULL,
  PRIMARY KEY (poll_date, voter_id)
);

-- Backfill: iedereen die al heeft gestemd telt als 'onthuld'.
INSERT OR IGNORE INTO voter_reveals (poll_date, voter_id, revealed_at)
SELECT poll_date, voter_id, created_at FROM votes;
