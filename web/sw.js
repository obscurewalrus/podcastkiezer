// Podcastdilemma service worker — Fase 1: zorg dat de site installeerbaar
// is op het beginscherm en biedt een rudimentaire offline-fallback. Geen
// push-handler (komt in Fase 2).

const CACHE = "podcastdilemma-v1";

const SHELL = [
  "/",
  "/archive.html",
  "/assets/style.css",
  "/assets/util.js",
  "/assets/app.js",
  "/assets/archive.js",
  "/assets/pwa.js",
  "/assets/notifications.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {
        // Eén ontbrekend asset mag de install niet ophouden;
        // ongecachte bestanden vallen later via runtime-cache terug.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("push", (event) => {
  // Payload-less push: we halen na ontvangst /api/poll op om het juiste
  // slot-label in de notificatie te zetten. Met een korte timeout en
  // fallback op de generieke tekst, zodat een trage of falende fetch
  // de melding niet tegenhoudt.
  event.waitUntil(
    (async () => {
      let slot = null;
      let slotLabel = null;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const res = await fetch("/api/poll", { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const poll = await res.json();
          slot = poll.slot || null;
          slotLabel = poll.slot_label || null;
        }
      } catch {
        // val terug op standaard tekst
      }
      const body = slotLabel
        ? `${slotLabel}-poll staat klaar — kom stemmen!`
        : "Een nieuwe poll staat klaar — kom stemmen!";
      // Slot-specifieke tag zodat ochtend en middag elkaar niet
      // overschrijven (= twee separate notificaties).
      const tag = slot
        ? `podcastdilemma-${slot}`
        : "podcastdilemma-daily";
      await self.registration.showNotification("Podcastdilemma", {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        data: { url: "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of all) {
        const u = new URL(c.url);
        if (u.pathname === "/" || u.pathname === "/index.html") {
          await c.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API-requests nooit cachen — die moeten altijd vers zijn.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        const resp = await fetch(req);
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Als het navigatie is, val terug op de gecachte hoofdpagina.
        if (req.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        return new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })()
  );
});
