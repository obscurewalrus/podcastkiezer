from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

import feedparser

TZ = ZoneInfo("Europe/Amsterdam")
UTC = ZoneInfo("UTC")


@dataclass
class Episode:
    source: str
    title: str
    published: datetime
    link: str
    duration_sec: int | None


def _parse_duration(raw: str | None) -> int | None:
    if not raw:
        return None
    raw = raw.strip()
    if ":" in raw:
        try:
            parts = [int(p) for p in raw.split(":")]
        except ValueError:
            return None
        if len(parts) == 3:
            h, m, s = parts
            return h * 3600 + m * 60 + s
        if len(parts) == 2:
            m, s = parts
            return m * 60 + s
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def fetch_main_episode(source: str, url: str, today: date) -> Episode | None:
    """Return the main episode of `today` for `source`, or None if absent.

    Strategy: of the entries with pubDate on `today` in NL time, pick the
    longest (itunes:duration). Falls back to the earliest if duration is
    missing on all. Aimed at filtering out short oproepjes and trailers.
    """
    parsed = feedparser.parse(url)
    candidates: list[tuple[int, datetime, object]] = []
    for entry in parsed.entries:
        published_parsed = getattr(entry, "published_parsed", None)
        if published_parsed is None:
            continue
        pub_utc = datetime(*published_parsed[:6], tzinfo=UTC)
        pub_local = pub_utc.astimezone(TZ)
        if pub_local.date() != today:
            continue
        duration = _parse_duration(entry.get("itunes_duration")) or 0
        candidates.append((duration, pub_local, entry))

    if not candidates:
        return None

    # Sort: longest first; on ties, earliest pub first.
    candidates.sort(key=lambda c: (-c[0], c[1]))
    duration, pub_local, entry = candidates[0]
    return Episode(
        source=source,
        title=entry.title.strip(),
        published=pub_local,
        link=getattr(entry, "link", ""),
        duration_sec=duration or None,
    )
