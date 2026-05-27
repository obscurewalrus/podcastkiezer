import { json, todayInAmsterdam } from "../_shared.js";

/**
 * Lijst van afgelopen polls met opties en tellingen, voor het archief.
 * Vandaag wordt overgeslagen — die zit op de hoofdpagina.
 */
export async function onRequestGet({ env }) {
  const today = todayInAmsterdam();

  const result = await env.DB.prepare(
    `SELECT p.date, p.question,
            po.letter, po.source, po.title, po.link, po.duration_sec,
            COALESCE(vc.cnt, 0) AS count
       FROM polls p
       JOIN poll_options po ON po.poll_date = p.date
  LEFT JOIN (
            SELECT poll_date, letter, COUNT(*) AS cnt
              FROM votes
          GROUP BY poll_date, letter
       ) vc ON vc.poll_date = p.date AND vc.letter = po.letter
      WHERE p.date < ?
   ORDER BY p.date DESC, po.letter
      LIMIT 200`
  )
    .bind(today)
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
      count,
    });
  }

  const polls = Array.from(byDate.values()).map((p) => {
    const winner = p.options.reduce(
      (best, o) => (o.count > best.count ? o : best),
      p.options[0]
    );
    return {
      ...p,
      winner:
        winner && winner.count > 0
          ? { letter: winner.letter, source: winner.source, count: winner.count }
          : null,
    };
  });

  return json({ polls });
}
