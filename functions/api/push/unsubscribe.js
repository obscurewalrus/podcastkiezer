import { json } from "../../_shared.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body moet JSON zijn." }, { status: 400 });
  }
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") {
    return json({ error: "Ongeldige endpoint." }, { status: 400 });
  }
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .run();
  return json({ ok: true });
}
