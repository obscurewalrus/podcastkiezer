// Opt-in voor push-meldingen. Plaatst een klein bannertje boven de
// poll-content. Verbergt zichzelf als de browser het niet ondersteunt
// of als push niet is geconfigureerd (geen VAPID-key op de server).

function urlBase64ToUint8Array(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const std = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(std);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const supported =
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  // Safari sets navigator.standalone als 'ie vanaf het beginscherm draait.
  window.navigator.standalone === true;

async function getConfig() {
  try {
    const res = await fetch("/api/push/config", { credentials: "same-origin" });
    if (!res.ok) return null;
    const cfg = await res.json();
    return cfg.enabled ? cfg : null;
  } catch {
    return null;
  }
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function subscribe(publicKey) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return sub;
}

async function unsubscribe(sub) {
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function render(state, handlers) {
  const banner = document.createElement("div");
  banner.className = "push-banner";

  if (state === "unsupported") {
    return null; // niets renderen
  }
  if (state === "ios-not-installed") {
    banner.append(
      el(
        "p",
        {},
        "Wil je een melding wanneer er een nieuwe poll is? Tik op de deelknop in Safari en kies 'Zet op beginscherm'. Daarna kun je vanaf het beginscherm meldingen aanzetten."
      )
    );
    return banner;
  }
  if (state === "denied") {
    banner.append(
      el(
        "p",
        {},
        "Meldingen zijn geblokkeerd. Pas dat aan in je browser-instellingen om alsnog een seintje bij een nieuwe poll te krijgen."
      )
    );
    return banner;
  }
  if (state === "subscribed") {
    banner.append(
      el("p", {}, "🔔 Meldingen staan aan. "),
      el(
        "button",
        {
          type: "button",
          class: "push-link",
          onclick: handlers.onUnsubscribe,
        },
        "Uitzetten"
      )
    );
    return banner;
  }
  // 'idle' — niet geabonneerd, kan dat wel
  banner.append(
    el(
      "p",
      {},
      "Wil je een seintje wanneer er een nieuwe poll is? "
    ),
    el(
      "button",
      {
        type: "button",
        class: "push-button",
        onclick: handlers.onSubscribe,
      },
      "Schakel meldingen in"
    )
  );
  return banner;
}

function mount(banner) {
  const slot = document.getElementById("push-banner-slot");
  if (slot) {
    slot.replaceChildren(banner);
  } else {
    // Fallback: voor de main
    const main = document.querySelector("main");
    if (main) main.prepend(banner);
  }
}

async function main() {
  if (!supported) return;
  if (isIOS && !isStandalone) {
    mount(render("ios-not-installed"));
    return;
  }
  const cfg = await getConfig();
  if (!cfg) return; // VAPID niet geconfigureerd op de server
  if (Notification.permission === "denied") {
    mount(render("denied"));
    return;
  }

  let sub = await currentSubscription();

  async function refresh() {
    sub = await currentSubscription();
    if (sub) {
      mount(render("subscribed", { onUnsubscribe: handleUnsubscribe }));
    } else {
      mount(render("idle", { onSubscribe: handleSubscribe }));
    }
  }

  async function handleSubscribe() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        await refresh();
        return;
      }
      sub = await subscribe(cfg.vapid_public_key);
      await refresh();
    } catch (err) {
      console.warn("Subscribe failed:", err);
      mount(render("denied"));
    }
  }

  async function handleUnsubscribe() {
    if (!sub) return;
    try {
      await unsubscribe(sub);
      sub = null;
      await refresh();
    } catch (err) {
      console.warn("Unsubscribe failed:", err);
    }
  }

  await refresh();
}

main();
