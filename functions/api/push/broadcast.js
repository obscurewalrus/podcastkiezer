import { json } from "../../_shared.js";
import { broadcastPush } from "../../_push.js";

/**
 * Stuur een 'nieuwe poll'-melding naar alle subscribers.
 *
 * Aanroep vanuit GitHub Actions:
 *   curl -X POST https://<site>/api/push/broadcast \
 *        -H "Authorization: Bearer <PUSH_BROADCAST_SECRET>"
 */
export async function onRequestPost({ request, env }) {
  const expected = env.PUSH_BROADCAST_SECRET;
  if (!expected) {
    return json({ error: "Broadcast niet geconfigureerd." }, { status: 503 });
  }
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${expected}`) {
    return json({ error: "Niet geautoriseerd." }, { status: 401 });
  }

  const rows = await env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions"
  ).all();
  const subs = rows.results || [];
  if (!subs.length) {
    return json({ sent: 0, removed: 0, failed: 0, total: 0 });
  }

  try {
    const stats = await broadcastPush(env, subs);
    return json(stats);
  } catch (err) {
    return json({ error: String(err && err.message) }, { status: 500 });
  }
}
