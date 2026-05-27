const DUTCH_MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

function formatDateNl(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${DUTCH_MONTHS[m - 1]} ${y}`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

async function fetchPoll(date) {
  const url = date ? `/api/poll?date=${encodeURIComponent(date)}` : "/api/poll";
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Fout ${res.status}`);
  }
  return res.json();
}

async function castVote(date, letter) {
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
  } else if (!poll.your_vote) {
    root.append(
      el(
        "p",
        { class: "notice" },
        "Welke kop spreekt jou aan? Klik om te stemmen. De bronnen blijven verborgen tot je hebt gestemd."
      )
    );
  } else {
    root.append(
      el(
        "p",
        { class: "notice" },
        `Je stemde op ${poll.your_vote}. Klik een andere kaart om te wisselen.`
      )
    );
  }

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

    if (poll.reveal && opt.source) {
      children.push(el("span", { class: "source" }, opt.source));
      if (opt.link) {
        children.push(
          el(
            "a",
            { class: "listen", href: opt.link, target: "_blank", rel: "noopener" },
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

    const button = el(
      "button",
      {
        class: `option${isYours ? " your-vote" : ""}`,
        type: "button",
        disabled: poll.can_vote ? null : "true",
        onclick: poll.can_vote
          ? async () => {
              try {
                button.disabled = true;
                const updated = await castVote(poll.date, opt.letter);
                renderPoll(root, updated);
              } catch (err) {
                renderError(root, err.message);
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
    renderError(
      root,
      err.message ||
        "Er is nog geen poll voor vandaag. Probeer het later opnieuw."
    );
  }
}

main();
