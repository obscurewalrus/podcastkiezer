from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
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
    artwork_url: str | None


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


def _href_from(obj) -> str | None:
    """Trek een href uit een dict, een feedparser-attribuut-object, of None."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get("href") or obj.get("url") or None
    href = getattr(obj, "href", None) or getattr(obj, "url", None)
    return href or None


def _listen_link(entry) -> str:
    """Geef een bruikbare luister-URL terug.

    Sommige feeds (o.a. Art19/NRC Vandaag) zetten geen `<link>` op het
    item; voor die gevallen vallen we terug op de eerste alternate-link
    en daarna op de audio-enclosure (MP3) zodat er altijd iets aan te
    klikken valt.
    """
    direct = getattr(entry, "link", "") or ""
    if direct:
        return direct
    for link in getattr(entry, "links", None) or []:
        rel = (link.get("rel") if isinstance(link, dict) else getattr(link, "rel", None)) or "alternate"
        href = _href_from(link)
        if href and rel == "alternate":
            return href
    for enc in getattr(entry, "enclosures", None) or []:
        href = _href_from(enc)
        if href:
            return href
    return ""


def _artwork_url(parsed_feed, entry) -> str | None:
    """Probeer aflevering-specifieke artwork; anders channel-niveau."""
    candidates = [
        entry.get("itunes_image"),
        entry.get("image"),
        (entry.get("media_thumbnail") or [None])[0] if isinstance(entry.get("media_thumbnail"), list) else None,
        parsed_feed.feed.get("itunes_image"),
        parsed_feed.feed.get("image"),
    ]
    for c in candidates:
        href = _href_from(c)
        if href:
            return href
    return None


def fetch_main_episode(
    source: str,
    url: str,
    now: datetime,
    *,
    max_age_hours: float = 72,
    exclude_title: str | None = None,
) -> Episode | None:
    """Return de hoofdaflevering die niet ouder is dan `max_age_hours`.

    Eerder filterden we op pubDate == vandaag; sinds we naar een
    ochtend-ritueel zijn overgestapt nemen we de meest recente
    aflevering binnen een venster. Bij een run om 07:30 NL is NOS
    De Dag (gisteren 14:30) ongeveer 17u oud, en het weekend-gat
    van vrijdag-middag naar maandag-ochtend komt op ~65u — beide
    ruim binnen de standaard cap.

    Selectie binnen het venster volgt nog steeds 'langste eerst, op
    gelijke duur de vroegste' zodat korte trailers en oproepjes
    wegvallen. `exclude_title` is een optionele regex (re.search)
    voor feeds met docu-series in dezelfde stroom.
    """
    exclude_re = re.compile(exclude_title) if exclude_title else None
    parsed = feedparser.parse(url)
    candidates: list[tuple[int, datetime, object]] = []
    cutoff = (now - timedelta(hours=max_age_hours)).astimezone(UTC)
    for entry in parsed.entries:
        published_parsed = getattr(entry, "published_parsed", None)
        if published_parsed is None:
            continue
        pub_utc = datetime(*published_parsed[:6], tzinfo=UTC)
        if pub_utc < cutoff:
            continue
        pub_local = pub_utc.astimezone(TZ)
        title = (entry.title or "").strip()
        if exclude_re and exclude_re.search(title):
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
        link=_listen_link(entry),
        duration_sec=duration or None,
        artwork_url=_artwork_url(parsed, entry),
    )
