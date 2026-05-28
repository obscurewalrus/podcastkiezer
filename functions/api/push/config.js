import { json } from "../../_shared.js";

export async function onRequestGet({ env }) {
  // Public VAPID-key is per definitie publiek, geen geheim.
  // Frontend gebruikt 'm bij pushManager.subscribe.
  if (!env.VAPID_PUBLIC_KEY) {
    return json({ enabled: false }, { status: 200 });
  }
  return json({
    enabled: true,
    vapid_public_key: env.VAPID_PUBLIC_KEY,
  });
}
