import {
  fetchPoll,
  getVoterStatus,
  isValidDate,
  json,
  parseCookies,
  shapePoll,
  todayInAmsterdam,
  VOTER_COOKIE,
} from "../_shared.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body moet JSON zijn." }, { status: 400 });
  }

  const date = body?.date;
  const letter = body?.letter ?? null; // null = stem intrekken
  const today = todayInAmsterdam();

  if (!isValidDate(date)) {
    return json({ error: "Ongeldige datum." }, { status: 400 });
  }
  if (date !== today) {
    return json(
      { error: "Stemmen kan alleen op de poll van vandaag." },
      { status: 403 }
    );
  }
  if (letter !== null && (typeof letter !== "string" || !/^[A-Z]$/.test(letter))) {
    return json({ error: "Ongeldige optie." }, { status: 400 });
  }

  // Vereis een bestaande cookie zodat het tellen beperkt is tot bezoekers
  // die eerst de pagina opvragen (en daarmee de cookie krijgen). Stopt
  // de meeste ballot-stuffing via curl/scripts zonder cookie-jar.
  const cookies = parseCookies(request);
  const voterId = cookies[VOTER_COOKIE];
  if (!voterId) {
    return json(
      { error: "Geen sessie gevonden — herlaad de pagina en stem opnieuw." },
      { status: 400 }
    );
  }

  const poll = await fetchPoll(env, date);
  if (!poll) {
    return json({ error: "Geen poll voor vandaag." }, { status: 404 });
  }
  if (letter !== null && !poll.options.some((o) => o.letter === letter)) {
    return json({ error: "Onbekende optie voor deze poll." }, { status: 400 });
  }

  const now = new Date().toISOString();
  if (letter === null) {
    // Stem intrekken; voter_reveals blijft staan zodat de bronnen
    // zichtbaar blijven — ze hebben ze immers al gezien.
    await env.DB.prepare(
      "DELETE FROM votes WHERE poll_date = ? AND voter_id = ?"
    )
      .bind(date, voterId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO votes (poll_date, voter_id, letter, created_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(poll_date, voter_id)
         DO UPDATE SET letter = excluded.letter, created_at = excluded.created_at`
    )
      .bind(date, voterId, letter, now)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO voter_reveals (poll_date, voter_id, revealed_at)
       VALUES (?1, ?2, ?3)`
    )
      .bind(date, voterId, now)
      .run();
  }

  // Tellingen verversen — we kennen de huidige `letter` al, maar voor de
  // `revealed`-vlag (na een eerste stem of deselect) en de bijgewerkte
  // tellingen halen we een status + poll op.
  const [refreshed, status] = await Promise.all([
    fetchPoll(env, date),
    getVoterStatus(env, date, voterId),
  ]);
  const shaped = shapePoll(refreshed, {
    isToday: true,
    revealed: status.revealed,
    yourVote: status.vote,
  });

  return json(shaped);
}
