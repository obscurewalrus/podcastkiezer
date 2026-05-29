import { json, SLOT_LABELS, todayInAmsterdam } from "../_shared.js";

// Twee slots per dag → ruimer limiet om ~60 dagen historie te tonen.
const ARCHIVE_LIMIT = 120;

/**
 * Lijst van afgelopen polls (per date+slot) met opties en tellingen,
 * voor het archief. Vandaag wordt overgeslagen — die zit op de
 * hoofdpagina.
 */
export async function onRequestGet({ env }) {
  const today = todayInAmsterdam();

  // Eerst de set (date, slot) begrenzen, daarna joinen — anders snijdt
  // LIMIT poll_options-rijen weg en krijg je een poll met te weinig opties.
  // Binnen een dag chronologisch: morning vóór afternoon.
  const result = await env.DB.prepare(
    `WITH recent AS (
       SELECT date, slot, question
         FROM polls
        WHERE date < ?1
     ORDER BY date DESC, CASE slot WHEN 'morning' THEN 0 ELSE 1 END
        LIMIT ?2
     )
     SELECT r.date, r.slot, r.question,
            po.letter, po.source, po.title, po.link, po.duration_sec, po.artwork_url,
            COALESCE(vc.cnt, 0) AS count
       FROM recent r
       JOIN poll_options po ON po.poll_date = r.date AND po.slot = r.slot
  LEFT JOIN (
            SELECT poll_date, slot, letter, COUNT(*) AS cnt
              FROM votes
             WHERE poll_date < ?1
          GROUP BY poll_date, slot, letter
       ) vc ON vc.poll_date = r.date AND vc.slot = r.slot AND vc.letter = po.letter
   ORDER BY r.date DESC, CASE r.slot WHEN 'morning' THEN 0 ELSE 1 END, po.letter`
  )
    .bind(today, ARCHIVE_LIMIT)
    .all();

  const byKey = new Map();
  for (const row of result.results || []) {
    const key = `${row.date}::${row.slot}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        date: row.date,
        slot: row.slot,
        slot_label: SLOT_LABELS[row.slot] || row.slot,
        question: row.question,
        total_votes: 0,
        options: [],
      };
      byKey.set(key, entry);
    }
    const count = Number(row.count) || 0;
    entry.total_votes += count;
    entry.options.push({
      letter: row.letter,
      source: row.source,
      title: row.title,
      link: row.link,
      duration_sec: row.duration_sec,
      artwork_url: row.artwork_url,
      count,
    });
  }

  const polls = Array.from(byKey.values()).map((p) => ({
    ...p,
    winner: pickWinner(p.options),
  }));

  return json({ polls });
}

function pickWinner(options) {
  if (!options.length) return null;
  let max = 0;
  let leaders = [];
  for (const o of options) {
    if (o.count > max) {
      max = o.count;
      leaders = [o];
    } else if (o.count === max && max > 0) {
      leaders.push(o);
    }
  }
  if (!leaders.length || max === 0) return null;
  if (leaders.length > 1) {
    return { tied: true, count: max, sources: leaders.map((o) => o.source) };
  }
  const w = leaders[0];
  return {
    tied: false,
    letter: w.letter,
    source: w.source,
    title: w.title,
    count: w.count,
  };
}
