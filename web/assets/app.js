import { el, formatDateNl } from "./util.js";

async function fetchPoll(date) {
  const url = date ? `/api/poll?date=${encodeURIComponent(date)}` : "/api/poll";
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Server geeft soms een context-afhankelijke uitleg mee (geen poll
    // vandaag omdat het te vroeg is, weekend, etc.) — gebruik die.
    const err = new Error(body.message || body.error || `Fout ${res.status}`);
    err.reason = body.reason;
    throw err;
  }
  return res.json();
}

async function castVote(date, letter) {
  // `letter` is een string A-Z, óf null om je stem in te trekken.
  const res = await fetch("/api/vote", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, letter }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Fout ${res.status}`);
  }
  return res.json();
}

function renderError(root, message) {
  root.replaceChildren(el("div", { class: "error" }, message));
}

function renderPoll(root, poll) {
  root.replaceChildren();

  const totalVotes = poll.reveal
    ? poll.options.reduce((s, o) => s + (o.count || 0), 0)
    : 0;

  root.append(
    el("p", { class: "meta" }, formatDateNl(poll.date)),
    el("h2", { class: "question" }, poll.question)
  );

  if (!poll.can_vote) {
    root.append(
      el(
        "p",
        { class: "notice" },
        "Dit is een afgelopen poll — alleen om terug te kijken."
      )
    );
  } else if (poll.your_vote) {
    root.append(
      el(
        "p",
        { class: "notice" },
        `Je stemde op ${poll.your_vote}. Klik een andere kaart om te wisselen, of nogmaals op ${poll.your_vote} om je stem in te trekken.`
      )
    );
  } else if (poll.reveal) {
    // Stem ingetrokken; bronnen zijn al onthuld.
    root.append(
      el(
        "p",
        { class: "notice" },
        "Je stem is ingetrokken. Klik een kaart om opnieuw te stemmen."
      )
    );
  } else {
    root.append(
      el(
        "p",
        { class: "notice" },
        "Welke podcast zou jij luisteren? Klik om te stemmen. De bronnen blijven verborgen tot je hebt gestemd."
      )
    );
  }

  // Voorkom dubbel-klik races: één pending vote tegelijk.
  let voting = false;
  const options = el("div", { class: "options" });
  for (const opt of poll.options) {
    const isYours = poll.your_vote === opt.letter;
    const pct =
      poll.reveal && totalVotes > 0
        ? Math.round((opt.count / totalVotes) * 100)
        : 0;

    const children = [
      el("span", { class: "letter" }, opt.letter),
      el("span", { class: "title" }, opt.title),
    ];

    if (poll.reveal && opt.artwork_url) {
      children.push(
        el("img", {
          class: "artwork",
          src: opt.artwork_url,
          alt: opt.source ? `Cover ${opt.source}` : "",
          loading: "lazy",
          referrerpolicy: "no-referrer",
        })
      );
    }

    if (poll.reveal && opt.source) {
      children.push(el("span", { class: "source" }, opt.source));
      if (opt.link) {
        children.push(
          el(
            "a",
            { class: "listen", href: opt.link, target: "_blank", rel: "noopener noreferrer" },
            "→ luister naar de aflevering"
          )
        );
      }
    }

    if (poll.reveal) {
      children.push(
        el("div", { class: "bar" }, [
          el("div", { class: "bar-track" }, [
            el("div", { class: "bar-fill", style: `width: ${pct}%` }),
          ]),
          el(
            "span",
            {},
            `${opt.count} ${opt.count === 1 ? "stem" : "stemmen"} (${pct}%)`
          ),
        ])
      );
    }

    const classes = ["option"];
    if (isYours) classes.push("your-vote");
    if (poll.reveal) classes.push("revealed");
    if (poll.reveal && opt.artwork_url) classes.push("has-artwork");

    const button = el(
      "button",
      {
        class: classes.join(" "),
        type: "button",
        disabled: poll.can_vote ? null : "true",
        onclick: poll.can_vote
          ? async () => {
              if (voting) return;
              voting = true;
              for (const b of options.querySelectorAll("button.option")) {
                b.disabled = true;
              }
              try {
                // Klik op je huidige stem → intrekken; anders nieuwe stem.
                const target = poll.your_vote === opt.letter ? null : opt.letter;
                const updated = await castVote(poll.date, target);
                renderPoll(root, updated);
              } catch (err) {
                renderError(root, err.message);
              } finally {
                voting = false;
              }
            }
          : null,
      },
      children
    );

    options.append(button);
  }
  root.append(options);

  if (poll.missing && poll.missing.length) {
    root.append(
      el(
        "p",
        { class: "missing" },
        `Geen aflevering vandaag: ${poll.missing.join(", ")}.`
      )
    );
  }
}

async function main() {
  const root = document.getElementById("app");
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date");
  try {
    const poll = await fetchPoll(date);
    renderPoll(root, poll);
  } catch (err) {
    renderError(root, err.message || "Kon de poll niet laden.");
  }
}

main();
