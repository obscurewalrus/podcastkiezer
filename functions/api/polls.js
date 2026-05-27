import { json, todayInAmsterdam } from "../_shared.js";

const ARCHIVE_LIMIT = 60;

/**
 * Lijst van afgelopen polls met opties en tellingen, voor het archief.
 * Vandaag wordt overgeslagen — die zit op de hoofdpagina.
 */
export async function onRequestGet({ env }) {
  const today = todayInAmsterdam();

  // Eerst de set datums begrenzen, daarna joinen — anders snijdt LIMIT
  // poll_options-rijen weg en krijg je een poll terug met te weinig opties.
  const result = await env.DB.prepare(
    `WITH recent AS (
       SELECT date, question
         FROM polls
        WHERE date < ?1
     ORDER BY date DESC
        LIMIT ?2
     )
     SELECT r.date, r.question,
            po.letter, po.source, po.title, po.link, po.duration_sec, po.artwork_url,
            COALESCE(vc.cnt, 0) AS count
       FROM recent r
       JOIN poll_options po ON po.poll_date = r.date
  LEFT JOIN (
            SELECT poll_date, letter, COUNT(*) AS cnt
              FROM votes
             WHERE poll_date < ?1
          GROUP BY poll_date, letter
       ) vc ON vc.poll_date = r.date AND vc.letter = po.letter
   ORDER BY r.date DESC, po.letter`
  )
    .bind(today, ARCHIVE_LIMIT)
    .all();

  const byDate = new Map();
  for (const row of result.results || []) {
    let entry = byDate.get(row.date);
    if (!entry) {
      entry = {
        date: row.date,
        question: row.question,
        total_votes: 0,
        options: [],
      };
      byDate.set(row.date, entry);
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

  const polls = Array.from(byDate.values()).map((p) => ({
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
