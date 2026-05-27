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
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

async function main() {
  const root = document.getElementById("archive");
  const heading = root.querySelector("h2");
  try {
    const res = await fetch("/api/polls", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Fout ${res.status}`);
    const { polls } = await res.json();
    root.replaceChildren(heading);

    if (!polls.length) {
      root.append(
        el(
          "p",
          { class: "notice" },
          "Nog geen afgelopen polls — kom morgen terug."
        )
      );
      return;
    }

    const list = el("ul", { class: "archive-list" });
    for (const p of polls) {
      const summary = p.winner
        ? `${p.winner.source} won met ${p.winner.count} ${
            p.winner.count === 1 ? "stem" : "stemmen"
          }`
        : "Geen stemmen";
      list.append(
        el("li", {}, [
          el("a", { href: `/?date=${encodeURIComponent(p.date)}` }, [
            el("span", { class: "date" }, formatDateNl(p.date)),
            el("span", { class: "winner" }, summary),
          ]),
        ])
      );
    }
    root.append(list);
  } catch (err) {
    root.replaceChildren(
      heading,
      el("div", { class: "error" }, err.message || "Kon archief niet laden.")
    );
  }
}

main();
