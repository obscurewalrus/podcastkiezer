import {
  fetchPoll,
  getVoterVote,
  isValidDate,
  json,
  newVoterId,
  parseCookies,
  setVoterCookie,
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

  const poll = await fetchPoll(env, date);
  if (!poll) {
    return json({ error: "Geen poll voor vandaag." }, { status: 404 });
  }
  if (!poll.options.some((o) => o.letter === letter)) {
    return json({ error: "Onbekende optie voor deze poll." }, { status: 400 });
  }

  const cookies = parseCookies(request);
  let voterId = cookies[VOTER_COOKIE];
  const extraHeaders = new Headers();
  if (!voterId) {
    voterId = newVoterId();
    setVoterCookie(extraHeaders, voterId);
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

  // Verse poll ophalen mét bijgewerkte tellingen.
  const refreshed = await fetchPoll(env, date);
  const yourVote = await getVoterVote(env, date, voterId);
  const shaped = shapePoll(refreshed, {
    isToday: true,
    hasVoted: true,
    yourVote,
  });

  return json(shaped, { headers: extraHeaders });
}
