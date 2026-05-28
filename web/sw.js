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
  // We sturen payload-less push (geen encryptie nodig); de melding zelf
  // is voor iedereen dezelfde tekst.
  event.waitUntil(
    self.registration.showNotification("Podcastdilemma", {
      body: "Een nieuwe poll staat klaar — kom stemmen!",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "podcastdilemma-daily", // overschrijft eerdere meldingen
      data: { url: "/" },
    })
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
