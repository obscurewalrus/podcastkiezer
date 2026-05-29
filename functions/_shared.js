// Gedeelde helpers voor de Pages Functions API.

export const VOTER_COOKIE = "pk_voter_id";
export const TZ = "Europe/Amsterdam";

export const SLOTS = ["morning", "afternoon"];
export const SLOT_LABELS = { morning: "Ochtend", afternoon: "Middag" };

export function isValidSlot(s) {
  return SLOTS.includes(s);
}

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

function currentHourAmsterdam() {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

/**
 * Geef een Nederlandse uitleg waarom een (datum, slot) (nog) geen poll
 * heeft. `requestedDate` en `today` zijn YYYY-MM-DD-strings; `slot` is
 * 'morning' of 'afternoon' (mag null zijn als er voor geen enkel slot
 * iets bestaat).
 */
export function noPollMessage(requestedDate, today, slot) {
  if (requestedDate > today) {
    return {
      reason: "future",
      message: "Deze datum ligt nog in de toekomst.",
    };
  }
  if (requestedDate < today) {
    return {
      reason: "past_missing",
      message:
        "Op deze dag is geen poll gegenereerd — mogelijk een feestdag of een storing in de feeds.",
    };
  }
  // requestedDate === today
  const hour = currentHourAmsterdam();
  if (slot === "afternoon" && hour < 17) {
    return {
      reason: "before_publish",
      message: "De middag-poll verschijnt rond 17:00. Vernieuw dan de pagina.",
    };
  }
  if (hour < 8) {
    return {
      reason: "before_publish",
      message:
        "De ochtend-poll verschijnt rond 07:30. Vernieuw dan de pagina.",
    };
  }
  return {
    reason: "delayed",
    message: "De poll wordt zo gegenereerd. Vernieuw zo de pagina.",
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

/**
 * Welke slots bestaan voor een datum, oudste→nieuwste (morning < afternoon).
 */
export async function availableSlots(env, date) {
  const rows = await env.DB.prepare(
    "SELECT slot FROM polls WHERE date = ?"
  )
    .bind(date)
    .all();
  const present = new Set((rows.results || []).map((r) => r.slot));
  return SLOTS.filter((s) => present.has(s));
}

/** Nieuwste beschikbare slot voor een datum, of null als er niets is. */
export function newestSlot(slots) {
  if (slots.includes("afternoon")) return "afternoon";
  if (slots.includes("morning")) return "morning";
  return null;
}

export async function fetchPoll(env, date, slot) {
  const pollRow = await env.DB.prepare(
    "SELECT date, slot, created_at, question, missing FROM polls WHERE date = ? AND slot = ?"
  )
    .bind(date, slot)
    .first();
  if (!pollRow) return null;

  const optionsResult = await env.DB.prepare(
    `SELECT po.letter, po.source, po.title, po.link, po.duration_sec, po.artwork_url,
            COALESCE(vc.cnt, 0) AS count
       FROM poll_options po
  LEFT JOIN (
            SELECT letter, COUNT(*) AS cnt
              FROM votes
             WHERE poll_date = ?1 AND slot = ?2
          GROUP BY letter
       ) vc ON vc.letter = po.letter
      WHERE po.poll_date = ?1 AND po.slot = ?2
   ORDER BY po.letter`
  )
    .bind(date, slot)
    .all();

  return {
    date: pollRow.date,
    slot: pollRow.slot,
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

export async function getVoterStatus(env, date, slot, voterId) {
  if (!voterId) return { vote: null, revealed: false };
  const [voteRow, revealRow] = await Promise.all([
    env.DB.prepare(
      "SELECT letter FROM votes WHERE poll_date = ? AND slot = ? AND voter_id = ?"
    )
      .bind(date, slot, voterId)
      .first(),
    env.DB.prepare(
      "SELECT 1 AS x FROM voter_reveals WHERE poll_date = ? AND slot = ? AND voter_id = ?"
    )
      .bind(date, slot, voterId)
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
export function shapePoll(poll, { isToday, revealed, yourVote, availableSlots }) {
  const hideAnswers = isToday && !revealed;
  return {
    date: poll.date,
    slot: poll.slot,
    slot_label: SLOT_LABELS[poll.slot] || poll.slot,
    available_slots: availableSlots || [poll.slot],
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
