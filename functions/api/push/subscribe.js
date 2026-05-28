import { ensureVoterId, json } from "../../_shared.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body moet JSON zijn." }, { status: 400 });
  }

  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return json({ error: "Ongeldige endpoint." }, { status: 400 });
  }
  if (typeof p256dh !== "string" || typeof auth !== "string") {
    return json({ error: "Ontbrekende keys." }, { status: 400 });
  }

  const { voterId, extraHeaders } = ensureVoterId(request);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, voter_id, p256dh, auth, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(endpoint) DO UPDATE SET
       voter_id = excluded.voter_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth`
  )
    .bind(endpoint, voterId, p256dh, auth, now)
    .run();

  return json({ ok: true }, { headers: extraHeaders });
}
