import { el, formatDateNl } from "./util.js";

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
      let summary;
      if (!p.winner) {
        summary = "Geen stemmen";
      } else if (p.winner.tied) {
        summary = `Gelijkspel op ${p.winner.count} ${p.winner.count === 1 ? "stem" : "stemmen"}`;
      } else {
        summary = `${p.winner.source} won met ${p.winner.count} ${
          p.winner.count === 1 ? "stem" : "stemmen"
        }`;
      }
      const href = `/?date=${encodeURIComponent(p.date)}&slot=${encodeURIComponent(p.slot)}`;
      const dateLabel = p.slot_label
        ? `${formatDateNl(p.date)} · ${p.slot_label}`
        : formatDateNl(p.date);
      list.append(
        el("li", {}, [
          el("a", { href }, [
            el("span", { class: "date" }, dateLabel),
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
