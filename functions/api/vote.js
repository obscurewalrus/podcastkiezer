import {
  fetchPoll,
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
  const letter = body?.letter;
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
  if (typeof letter !== "string" || !/^[A-Z]$/.test(letter)) {
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
  if (!poll.options.some((o) => o.letter === letter)) {
    return json({ error: "Onbekende optie voor deze poll." }, { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO votes (poll_date, voter_id, letter, created_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(poll_date, voter_id)
       DO UPDATE SET letter = excluded.letter, created_at = excluded.created_at`
  )
    .bind(date, voterId, letter, now)
    .run();

  // Werk de tellingen bij door één SELECT te draaien; de letter weten we al
  // (we hebben 'm net geschreven), dus we slaan een tweede getVoterVote-query
  // over en vermijden read-after-write-replica-issues.
  const refreshed = await fetchPoll(env, date);
  const shaped = shapePoll(refreshed, {
    isToday: true,
    hasVoted: true,
    yourVote: letter,
  });

  return json(shaped);
}
