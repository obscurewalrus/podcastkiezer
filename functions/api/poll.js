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
    return json(
      { error: "Geen poll voor deze datum.", date },
      { status: 404 }
    );
  }

  const cookies = parseCookies(request);
  let voterId = cookies[VOTER_COOKIE];
  const extraHeaders = new Headers();
  if (!voterId) {
    voterId = newVoterId();
    setVoterCookie(extraHeaders, voterId);
  }

  const isToday = date === today;
  const yourVote = await getVoterVote(env, date, voterId);
  const shaped = shapePoll(poll, {
    isToday,
    hasVoted: !!yourVote,
    yourVote,
  });

  return json(shaped, { headers: extraHeaders });
}
