#!/usr/bin/env python3
"""Daily podcast headline poll for the redactie."""
from __future__ import annotations

import argparse
import os
import random
import sys
from datetime import datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from channels import (
    render_d1_sql,
    render_markdown_log,
    render_solution,
    render_whatsapp,
    send_mail,
    send_slack,
    slot_label,
)
from feeds import Episode, fetch_main_episode

TZ = ZoneInfo("Europe/Amsterdam")
ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "out"

# Per slot: het venster waarbinnen een aflevering nog 'vers' telt, plus
# het tijdstip dat een --date-debugrun simuleert.
#   morning  — 07:30 NL, 72u-venster: NOS/VK nog van gisteren-middag,
#              NRC/FD van vanochtend. Weekend-gat past binnen 72u.
#   afternoon — 17:00 NL, 24u-venster: alle vier vers van vandaag.
SLOT_CONFIG = {
    "morning": {"max_age_hours": 72, "sim_time": time(7, 30)},
    "afternoon": {"max_age_hours": 24, "sim_time": time(17, 0)},
}

# Minimaal aantal opties voor een zinvolle poll. Onder deze drempel
# (bv. een schrale weekend-middag) genereren we niets, en stuurt de
# workflow ook geen push.
MIN_OPTIONS = 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genereer dagelijkse podcast-poll.")
    parser.add_argument(
        "--slot",
        choices=sorted(SLOT_CONFIG),
        default="morning",
        help="Welk slot ('morning' of 'afternoon'). Default: morning.",
    )
    parser.add_argument(
        "--date",
        help="ISO-datum (YYYY-MM-DD) om te gebruiken in plaats van vandaag. Voor debug.",
    )
    parser.add_argument(
        "--no-send",
        action="store_true",
        help="Schrijf alleen het logboek, sla externe kanalen (Slack/mail) over.",
    )
    args = parser.parse_args(argv)

    config = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))

    slot = args.slot
    slot_cfg = SLOT_CONFIG[slot]
    max_age_hours = slot_cfg["max_age_hours"]

    if args.date:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
        # Simuleer een normale run voor dit slot op die datum.
        now = datetime.combine(target_date, slot_cfg["sim_time"], tzinfo=TZ)
        today = target_date
    else:
        now = datetime.now(TZ)
        today = now.date()

    print(f"Slot: {slot} ({slot_label(slot)}), venster {max_age_hours}u\n")

    episodes: list[Episode] = []
    missing: list[str] = []
    for feed in config["feeds"]:
        name = feed["name"]
        try:
            ep = fetch_main_episode(
                name,
                feed["url"],
                now,
                max_age_hours=max_age_hours,
                exclude_title=feed.get("exclude_title"),
            )
        except Exception as exc:
            print(f"⚠️  Feed {name!r} faalde: {exc}", file=sys.stderr)
            ep = None
        if ep is None:
            missing.append(name)
            print(f"  {name}: geen verse aflevering binnen {max_age_hours}u.")
        else:
            episodes.append(ep)
            print(f"  {name}: {ep.title}")

    if len(episodes) < MIN_OPTIONS:
        print(
            f"\nMinder dan {MIN_OPTIONS} verse afleveringen voor slot {slot!r} — "
            "geen poll gegenereerd.",
            file=sys.stderr,
        )
        return 1

    # Seed met datum + slot zodat ochtend en middag onafhankelijk husselen.
    rng = random.Random(f"{today.isoformat()}-{slot}")
    shuffled = episodes[:]
    rng.shuffle(shuffled)

    poll_text = render_whatsapp(today, slot, shuffled, missing)
    solution_text = render_solution(shuffled, missing)

    OUT_DIR.mkdir(exist_ok=True)
    stem = f"{today.isoformat()}-{slot}"
    log_path = OUT_DIR / f"{stem}.md"
    log_path.write_text(
        render_markdown_log(today, slot, poll_text, solution_text), encoding="utf-8"
    )
    sql_path = OUT_DIR / f"{stem}.sql"
    sql_path.write_text(render_d1_sql(today, slot, shuffled, missing), encoding="utf-8")
    print(f"\nLogboek: {log_path.relative_to(ROOT)}")
    print(f"D1 SQL:  {sql_path.relative_to(ROOT)}\n")
    print(poll_text)

    if args.no_send:
        return 0

    slack_url = os.environ.get("SLACK_WEBHOOK_URL")
    if slack_url:
        try:
            send_slack(slack_url, today, slot, poll_text, solution_text)
            print("\n→ Slack: verstuurd.")
        except Exception as exc:
            print(f"\n→ Slack: mislukt — {exc}", file=sys.stderr)
            return 2

    if os.environ.get("SMTP_HOST"):
        try:
            send_mail(config.get("mail", {}), today, slot, poll_text, solution_text)
            print("→ Mail: verstuurd.")
        except Exception as exc:
            print(f"→ Mail: mislukt — {exc}", file=sys.stderr)
            return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
