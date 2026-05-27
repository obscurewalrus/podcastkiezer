// Gedeelde helpers voor de Pages Functions API.

export const VOTER_COOKIE = "pk_voter_id";
export const TZ = "Europe/Amsterdam";

export function todayInAmsterdam() {
  // YYYY-MM-DD voor de Nederlandse kalenderdatum, ongeacht waar de Worker draait.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

export function newVoterId() {
  return crypto.randomUUID();
}

export function setVoterCookie(headers, voterId) {
  // 2 jaar, Lax, Secure, HttpOnly. JS hoeft 'm niet te lezen.
  const maxAge = 60 * 60 * 24 * 365 * 2;
  headers.append(
    "Set-Cookie",
    `${VOTER_COOKIE}=${voterId}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure; HttpOnly`
  );
}

export function json(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export async function fetchPoll(env, date) {
  const pollRow = await env.DB.prepare(
    "SELECT date, created_at, question, missing FROM polls WHERE date = ?"
  )
    .bind(date)
    .first();
  if (!pollRow) return null;

  const optionsResult = await env.DB.prepare(
    `SELECT po.letter, po.source, po.title, po.link, po.duration_sec,
            COALESCE(vc.cnt, 0) AS count
       FROM poll_options po
  LEFT JOIN (
            SELECT letter, COUNT(*) AS cnt
              FROM votes
             WHERE poll_date = ?1
          GROUP BY letter
       ) vc ON vc.letter = po.letter
      WHERE po.poll_date = ?1
   ORDER BY po.letter`
  )
    .bind(date)
    .all();

  return {
    date: pollRow.date,
    created_at: pollRow.created_at,
    question: pollRow.question,
    missing: JSON.parse(pollRow.missing || "[]"),
    options: (optionsResult.results || []).map((r) => ({
      letter: r.letter,
      source: r.source,
      title: r.title,
      link: r.link,
      duration_sec: r.duration_sec,
      count: Number(r.count) || 0,
    })),
  };
}

export async function getVoterVote(env, date, voterId) {
  if (!voterId) return null;
  const row = await env.DB.prepare(
    "SELECT letter FROM votes WHERE poll_date = ? AND voter_id = ?"
  )
    .bind(date, voterId)
    .first();
  return row ? row.letter : null;
}

/**
 * Verberg `source`/`link` als er nog niet is gestemd op een actieve poll.
 * Past poll = altijd alles tonen.
 */
export function shapePoll(poll, { isToday, hasVoted, yourVote }) {
  const hideAnswers = isToday && !hasVoted;
  return {
    date: poll.date,
    created_at: poll.created_at,
    question: poll.question,
    missing: poll.missing,
    is_today: isToday,
    your_vote: yourVote,
    can_vote: isToday,
    reveal: !hideAnswers,
    options: poll.options.map((o) => ({
      letter: o.letter,
      title: o.title,
      // Bron + link + telling pas tonen na stem (of bij oude polls).
      source: hideAnswers ? null : o.source,
      link: hideAnswers ? null : o.link,
      count: hideAnswers ? null : o.count,
    })),
  };
}
