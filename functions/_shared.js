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
    if (!k) continue;
    const raw = v.join("=");
    try {
      out[k] = decodeURIComponent(raw);
    } catch {
      // Een rommelige cookie van een andere app op hetzelfde domein mag
      // de hele request niet laten crashen — pak de rauwe waarde.
      out[k] = raw;
    }
  }
  return out;
}

export function newVoterId() {
  return crypto.randomUUID();
}

function isSecureRequest(request) {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  // Cloudflare zet deze header op de oorspronkelijke client-protocol.
  if (request.headers.get("X-Forwarded-Proto") === "https") return true;
  return false;
}

export function setVoterCookie(headers, voterId, request) {
  // 2 jaar, Lax, HttpOnly. Secure alleen onder https, anders weigert
  // de browser onder `wrangler pages dev` (http://localhost) de cookie.
  const maxAge = 60 * 60 * 24 * 365 * 2;
  const secure = isSecureRequest(request) ? "; Secure" : "";
  headers.append(
    "Set-Cookie",
    `${VOTER_COOKIE}=${voterId}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}; HttpOnly`
  );
}

/**
 * Lees voter_id uit cookies; mint er een als 'ie ontbreekt en zet 'm via
 * `extraHeaders` op het response. Roep aan als je tolerant wil zijn voor
 * eerste bezoekers (GET /api/poll).
 */
export function ensureVoterId(request) {
  const cookies = parseCookies(request);
  const existing = cookies[VOTER_COOKIE];
  const extraHeaders = new Headers();
  if (existing) return { voterId: existing, extraHeaders };
  const voterId = newVoterId();
  setVoterCookie(extraHeaders, voterId, request);
  return { voterId, extraHeaders };
}

function dayOfWeekUtc(isoDate) {
  // 0 = zondag, 6 = zaterdag. Middag-UTC zodat DST de dag niet kantelt.
  const d = new Date(isoDate + "T12:00:00Z");
  return d.getUTCDay();
}

function currentHourAmsterdam() {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

/**
 * Geef een Nederlandse uitleg waarom een datum (nog) geen poll heeft.
 * `requestedDate` is een YYYY-MM-DD-string; `today` ook.
 */
export function noPollMessage(requestedDate, today) {
  if (requestedDate > today) {
    return {
      reason: "future",
      message: "Deze datum ligt nog in de toekomst.",
    };
  }
  if (requestedDate < today) {
    const dow = dayOfWeekUtc(requestedDate);
    if (dow === 0 || dow === 6) {
      return {
        reason: "past_weekend",
        message:
          "Op deze dag was het weekend — niet alle dagelijkse podcasts publiceren dan.",
      };
    }
    return {
      reason: "past_missing",
      message:
        "Op deze dag is geen poll gegenereerd — misschien een feestdag of een storing in de feeds.",
    };
  }
  // requestedDate === today
  const dow = dayOfWeekUtc(today);
  if (dow === 0 || dow === 6) {
    return {
      reason: "weekend",
      message:
        "Het is weekend — niet alle dagelijkse podcasts publiceren vandaag. Kom maandag terug voor een nieuwe poll.",
    };
  }
  const hour = currentHourAmsterdam();
  if (hour < 5) {
    return {
      reason: "too_early",
      message:
        "De eerste podcasts (NRC Vandaag, Dagkoersen) verschijnen rond 05:00. Kom dan terug.",
    };
  }
  if (hour < 15) {
    return {
      reason: "before_publish",
      message:
        "Nog niet alle dagelijkse podcasts zijn gepubliceerd — NOS De Dag en VK Elke Dag komen rond 14:30. De poll verschijnt rond 15:00.",
    };
  }
  return {
    reason: "delayed",
    message:
      "De poll van vandaag wordt zo gegenereerd. Vernieuw zo de pagina.",
  };
}

export function json(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function safeJsonParse(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function fetchPoll(env, date) {
  const pollRow = await env.DB.prepare(
    "SELECT date, created_at, question, missing FROM polls WHERE date = ?"
  )
    .bind(date)
    .first();
  if (!pollRow) return null;

  const optionsResult = await env.DB.prepare(
    `SELECT po.letter, po.source, po.title, po.link, po.duration_sec, po.artwork_url,
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
    missing: safeJsonParse(pollRow.missing, []),
    options: (optionsResult.results || []).map((r) => ({
      letter: r.letter,
      source: r.source,
      title: r.title,
      link: r.link,
      duration_sec: r.duration_sec,
      artwork_url: r.artwork_url,
      count: Number(r.count) || 0,
    })),
  };
}

export async function getVoterStatus(env, date, voterId) {
  if (!voterId) return { vote: null, revealed: false };
  const [voteRow, revealRow] = await Promise.all([
    env.DB.prepare("SELECT letter FROM votes WHERE poll_date = ? AND voter_id = ?")
      .bind(date, voterId)
      .first(),
    env.DB.prepare("SELECT 1 AS x FROM voter_reveals WHERE poll_date = ? AND voter_id = ?")
      .bind(date, voterId)
      .first(),
  ]);
  return {
    vote: voteRow ? voteRow.letter : null,
    revealed: !!revealRow,
  };
}

/**
 * Verberg `source`/`link` als er op een actieve poll nog niet ooit
 * gestemd is door deze browser. Bronnen blijven wel zichtbaar als
 * iemand zijn stem heeft ingetrokken (ze hebben ze al gezien).
 * Past poll = altijd alles tonen.
 */
export function shapePoll(poll, { isToday, revealed, yourVote }) {
  const hideAnswers = isToday && !revealed;
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
      duration_sec: hideAnswers ? null : o.duration_sec,
      source: hideAnswers ? null : o.source,
      link: hideAnswers ? null : o.link,
      artwork_url: hideAnswers ? null : o.artwork_url,
      count: hideAnswers ? null : o.count,
    })),
  };
}
