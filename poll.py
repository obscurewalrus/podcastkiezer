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
)
from feeds import Episode, fetch_main_episode

TZ = ZoneInfo("Europe/Amsterdam")
ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "out"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genereer dagelijkse podcast-poll.")
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

    if args.date:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
        # Simuleer een normale ochtend-run: 07:30 NL op die datum.
        now = datetime.combine(target_date, time(7, 30), tzinfo=TZ)
        today = target_date
    else:
        now = datetime.now(TZ)
        today = now.date()

    episodes: list[Episode] = []
    missing: list[str] = []
    for feed in config["feeds"]:
        name = feed["name"]
        try:
            ep = fetch_main_episode(
                name,
                feed["url"],
                now,
                exclude_title=feed.get("exclude_title"),
            )
        except Exception as exc:
            print(f"⚠️  Feed {name!r} faalde: {exc}", file=sys.stderr)
            ep = None
        if ep is None:
            missing.append(name)
            print(f"  {name}: geen aflevering van {today.isoformat()}.")
        else:
            episodes.append(ep)
            print(f"  {name}: {ep.title}")

    if not episodes:
        print(
            "Geen enkele feed had een aflevering van vandaag. Niets om te pollen.",
            file=sys.stderr,
        )
        return 1

    rng = random.Random(today.isoformat())
    shuffled = episodes[:]
    rng.shuffle(shuffled)

    poll_text = render_whatsapp(today, shuffled, missing)
    solution_text = render_solution(shuffled, missing)

    OUT_DIR.mkdir(exist_ok=True)
    log_path = OUT_DIR / f"{today.isoformat()}.md"
    log_path.write_text(
        render_markdown_log(today, poll_text, solution_text), encoding="utf-8"
    )
    sql_path = OUT_DIR / f"{today.isoformat()}.sql"
    sql_path.write_text(render_d1_sql(today, shuffled, missing), encoding="utf-8")
    print(f"\nLogboek: {log_path.relative_to(ROOT)}")
    print(f"D1 SQL:  {sql_path.relative_to(ROOT)}\n")
    print(poll_text)

    if args.no_send:
        return 0

    slack_url = os.environ.get("SLACK_WEBHOOK_URL")
    if slack_url:
        try:
            send_slack(slack_url, today, poll_text, solution_text)
            print("\n→ Slack: verstuurd.")
        except Exception as exc:
            print(f"\n→ Slack: mislukt — {exc}", file=sys.stderr)
            return 2

    if os.environ.get("SMTP_HOST"):
        try:
            send_mail(config.get("mail", {}), today, poll_text, solution_text)
            print("→ Mail: verstuurd.")
        except Exception as exc:
            print(f"→ Mail: mislukt — {exc}", file=sys.stderr)
            return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
