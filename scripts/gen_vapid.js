#!/usr/bin/env node
// Eenmalige VAPID-keypair voor Web Push. Genereert een P-256 ECDSA-paar
// en print de waarden die je in Cloudflare Pages moet zetten.
//
//   node scripts/gen_vapid.js

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const pubJwk = publicKey.export({ format: "jwk" });
const privJwk = privateKey.export({ format: "jwk" });

// VAPID public key = uncompressed P-256 point (0x04 || x || y), base64url.
function b64uToBuf(s) {
  return Buffer.from(s, "base64"); // accepteert ook base64url
}
const x = b64uToBuf(pubJwk.x);
const y = b64uToBuf(pubJwk.y);
const uncompressed = Buffer.concat([Buffer.from([0x04]), x, y]);
const vapidPublic = uncompressed.toString("base64url");

// Privé sleutel als JWK-string, dat is wat de Worker importeert.
const vapidPrivJwk = JSON.stringify({
  kty: privJwk.kty,
  crv: privJwk.crv,
  d: privJwk.d,
  x: privJwk.x,
  y: privJwk.y,
});

const NL = "\n";
process.stdout.write(
  [
    "--- VAPID-keypair gegenereerd ---",
    "",
    "Plain env-variabelen (Cloudflare Pages → Settings → Variables and Secrets → Production):",
    "",
    "  VAPID_PUBLIC_KEY = " + vapidPublic,
    "  VAPID_SUBJECT    = mailto:redactie@voorbeeld.nl   ← vervang door een echt mailadres",
    "",
    "Secret (zelfde scherm, vink 'Encrypt' aan):",
    "",
    "  VAPID_PRIVATE_KEY_JWK = " + vapidPrivJwk,
    "",
    "Maak ook een eigen broadcast-secret voor de workflow:",
    "",
    "  PUSH_BROADCAST_SECRET = " + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
    "",
    "  ← Zet als secret in zowel Cloudflare Pages als GitHub Actions.",
    "  ← Zet ook PUSH_BROADCAST_URL=https://<jouw-site>/api/push/broadcast als GitHub secret.",
    "",
  ].join(NL)
);
