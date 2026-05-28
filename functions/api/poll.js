import {
  ensureVoterId,
  fetchPoll,
  getVoterStatus,
  isValidDate,
  json,
  noPollMessage,
  shapePoll,
  todayInAmsterdam,
} from "../_shared.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const queryDate = url.searchParams.get("date");
  const today = todayInAmsterdam();
  const date = queryDate || today;

  if (!isValidDate(date)) {
    return json({ error: "Ongeldige datum." }, { status: 400 });
  }

  const poll = await fetchPoll(env, date);
  if (!poll) {
    const ctx = noPollMessage(date, today);
    return json(
      { error: "Geen poll voor deze datum.", date, ...ctx },
      { status: 404 }
    );
  }

  const { voterId, extraHeaders } = ensureVoterId(request);

  const isToday = date === today;
  const status = await getVoterStatus(env, date, voterId);
  const shaped = shapePoll(poll, {
    isToday,
    revealed: status.revealed,
    yourVote: status.vote,
  });

  return json(shaped, { headers: extraHeaders });
}
