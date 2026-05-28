// VAPID + Web Push verzenden vanuit een Cloudflare Pages Function.
//
// We sturen payload-less push: het is voor iedereen dezelfde melding
// ("Nieuwe poll staat klaar"), dus we slaan de payload-encryptie over
// en laten de service worker een vaste melding tonen. Dat scheelt ~200
// regels aes128gcm-code en houdt het auditeerbaar.

function base64urlEncode(input) {
  let bytes;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = input;
  }
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function loadVapidPrivateKey(jwkRaw) {
  const jwk = typeof jwkRaw === "string" ? JSON.parse(jwkRaw) : jwkRaw;
  // Stripped JWK — sommige importers struikelen over extra velden.
  const minimal = { kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y };
  return crypto.subtle.importKey(
    "jwk",
    minimal,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function signVapidJwt(privateKey, audience, subject) {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 uur
    sub: subject,
  };
  const signingInput =
    base64urlEncode(JSON.stringify(header)) +
    "." +
    base64urlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return signingInput + "." + base64urlEncode(signature);
}

async function sendOneWebPush(subscription, ctx) {
  const url = new URL(subscription.endpoint);
  const audience = url.protocol + "//" + url.host;
  const jwt = await signVapidJwt(ctx.privateKey, audience, ctx.subject);

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${ctx.publicKey}`,
      TTL: "86400",
      Urgency: "normal",
      Topic: "podcastdilemma-daily",
      "Content-Length": "0",
    },
  });
}

/**
 * Stuur een push naar elke subscription. Subscriptions die 404/410
 * teruggeven (= browser heeft 'm afgemeld) worden uit D1 verwijderd.
 * Sequentieel om push-service rate-limits niet te raken; voor onze
 * schaal (≤ ~50 redactieleden) ruim snel genoeg.
 */
export async function broadcastPush(env, subs) {
  if (!env.VAPID_PRIVATE_KEY_JWK || !env.VAPID_PUBLIC_KEY) {
    throw new Error("VAPID-keys niet geconfigureerd.");
  }
  const ctx = {
    privateKey: await loadVapidPrivateKey(env.VAPID_PRIVATE_KEY_JWK),
    publicKey: env.VAPID_PUBLIC_KEY,
    subject: env.VAPID_SUBJECT || "mailto:redactie@example.com",
  };
  const now = new Date().toISOString();
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const sub of subs) {
    try {
      const res = await sendOneWebPush(sub, ctx);
      if (res.status >= 200 && res.status < 300) {
        sent++;
        await env.DB.prepare(
          "UPDATE push_subscriptions SET last_sent = ? WHERE endpoint = ?"
        )
          .bind(now, sub.endpoint)
          .run();
      } else if (res.status === 404 || res.status === 410) {
        await env.DB.prepare(
          "DELETE FROM push_subscriptions WHERE endpoint = ?"
        )
          .bind(sub.endpoint)
          .run();
        removed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { sent, removed, failed, total: subs.length };
}
