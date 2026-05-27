from __future__ import annotations

import json
import os
import smtplib
import urllib.request
from datetime import date, datetime, timezone
from email.message import EmailMessage

from feeds import Episode

LETTERS = "ABCDEFGH"
WHATSAPP_OPTION_MAX = 100  # WhatsApp poll option character limit
WHATSAPP_QUESTION_MAX = 255
POLL_QUESTION = "Welke podcast zou jij vandaag luisteren?"

DUTCH_MONTHS = {
    1: "januari", 2: "februari", 3: "maart", 4: "april",
    5: "mei", 6: "juni", 7: "juli", 8: "augustus",
    9: "september", 10: "oktober", 11: "november", 12: "december",
}


def format_date_nl(d: date) -> str:
    return f"{d.day} {DUTCH_MONTHS[d.month]} {d.year}"


def _truncate(s: str, n: int) -> str:
    s = s.strip()
    if len(s) <= n:
        return s
    return s[: n - 1].rstrip() + "…"


def render_whatsapp(today: date, shuffled: list[Episode], missing: list[str]) -> str:
    lines = [
        f"🎧 Podcastdilemma — {format_date_nl(today)}",
        "",
        "Plak dit als WhatsApp-poll.",
        "",
        "Vraag:",
        _truncate(POLL_QUESTION, WHATSAPP_QUESTION_MAX),
        "",
        "Opties:",
    ]
    for i, ep in enumerate(shuffled):
        lines.append(f"{LETTERS[i]}) {_truncate(ep.title, WHATSAPP_OPTION_MAX - 3)}")
    if missing:
        lines += ["", f"(Geen aflevering vandaag: {', '.join(missing)})"]
    return "\n".join(lines)


def render_solution(shuffled: list[Episode], missing: list[str]) -> str:
    lines = []
    for i, ep in enumerate(shuffled):
        link = f" — {ep.link}" if ep.link else ""
        lines.append(f"{LETTERS[i]}) {ep.source}: {ep.title}{link}")
    if missing:
        lines += ["", f"Geen aflevering vandaag: {', '.join(missing)}."]
    return "\n".join(lines)


def _sql_literal(value) -> str:
    """Render een Python-waarde als SQL-literal voor D1 (geen prepared statements bij `wrangler d1 execute --file`)."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def render_d1_sql(today: date, shuffled: list[Episode], missing: list[str]) -> str:
    """SQL voor D1 om deze poll te registreren. Idempotent dankzij `OR IGNORE`."""
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    missing_json = json.dumps(missing, ensure_ascii=False)

    stmts = [
        "INSERT OR IGNORE INTO polls (date, created_at, question, missing) VALUES ("
        f"{_sql_literal(today.isoformat())}, "
        f"{_sql_literal(created_at)}, "
        f"{_sql_literal(POLL_QUESTION)}, "
        f"{_sql_literal(missing_json)});"
    ]
    for i, ep in enumerate(shuffled):
        stmts.append(
            "INSERT OR IGNORE INTO poll_options "
            "(poll_date, letter, source, title, link, duration_sec, artwork_url) VALUES ("
            f"{_sql_literal(today.isoformat())}, "
            f"{_sql_literal(LETTERS[i])}, "
            f"{_sql_literal(ep.source)}, "
            f"{_sql_literal(ep.title)}, "
            f"{_sql_literal(ep.link or None)}, "
            f"{_sql_literal(ep.duration_sec)}, "
            f"{_sql_literal(ep.artwork_url)}"
            ");"
        )
    return "\n".join(stmts) + "\n"


def render_markdown_log(today: date, poll_text: str, solution_text: str) -> str:
    return (
        f"# Podcastdilemma — {format_date_nl(today)}\n\n"
        f"## WhatsApp-poll\n\n"
        f"```\n{poll_text}\n```\n\n"
        f"## Oplossing\n\n"
        f"```\n{solution_text}\n```\n"
    )


def send_slack(webhook_url: str, today: date, poll_text: str, solution_text: str) -> None:
    payload = {
        "text": (
            f"*Podcastdilemma — {format_date_nl(today)}*\n"
            f"```\n{poll_text}\n```\n"
            f":warning: *Oplossing — niet lezen tot iedereen heeft gestemd:*\n"
            f"```\n{solution_text}\n```"
        )
    }
    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        if resp.status >= 300:
            raise RuntimeError(f"Slack webhook returned {resp.status}: {body}")


def send_mail(mail_config: dict, today: date, poll_text: str, solution_text: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    use_tls = os.environ.get("SMTP_STARTTLS", "true").lower() != "false"

    recipients = mail_config.get("to") or []
    sender = mail_config.get("from") or user
    if not recipients or not sender:
        raise RuntimeError("Mail config requires 'from' and at least one 'to'.")

    prefix = mail_config.get("subject_prefix", "[Podcastdilemma]")

    msg = EmailMessage()
    msg["Subject"] = f"{prefix} {format_date_nl(today)}"
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content(
        "WhatsApp-poll:\n\n"
        f"{poll_text}\n\n"
        "—\n\n"
        "Oplossing (niet meteen lezen!):\n\n"
        f"{solution_text}\n"
    )

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls()
            smtp.ehlo()
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)
