# Podcastkiezer

Trekt elke dag de kop van de hoofdaflevering van **NRC Vandaag**, **De Dag (NOS)**, **Elke Dag (Volkskrant)** en **Dagkoersen (FD)**, husselt de volgorde, en levert een poll-template die je in een WhatsApp-groep kunt plakken. Bedoeld voor redactionele discussie over koerskeuzes.

## Wat krijg je terug

Per run schrijft het script een Markdown-logboek naar `out/YYYY-MM-DD.md` met:
- de **WhatsApp-poll-template** (vraag + 4 opties met letters A–D, gehusseld);
- de **oplossing** (welke letter bij welke titel hoort), inclusief links.

Als de bijbehorende GitHub Actions secrets zijn gezet, wordt het ook naar Slack en/of e-mail gestuurd.

## Lokaal draaien

```bash
pip install -r requirements.txt
python poll.py
```

Handig voor debug:

```bash
python poll.py --date 2026-05-26   # voor een specifieke dag
python poll.py --no-send           # geen Slack/mail, alleen logboek
```

## Automatisch draaien op GitHub Actions

De workflow staat in `.github/workflows/poll.yml` en draait dagelijks om **14:00 UTC** (= 15:00 wintertijd / 16:00 zomertijd in Nederland — GitHub Actions cron ondersteunt geen DST). Aanpassen kan via de `cron`-regel.

### Eerste keer aanzetten

1. Push deze branch naar GitHub en merge naar de default branch (`main`). Scheduled workflows draaien **alleen** vanaf de default branch.
2. Op GitHub: tab **Actions** → workflows zijn standaard aan voor je eigen repo.
3. Handmatig testen: tab **Actions** → "Daily poll" → **Run workflow**.

### Secrets toevoegen (optioneel)

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Wanneer instellen |
| --- | --- |
| `SLACK_WEBHOOK_URL` | Als je naar Slack wil posten. Maak een Incoming Webhook in Slack en plak de URL. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Als je mail wil versturen. `SMTP_STARTTLS=false` zet TLS uit (standaard aan). |

Zet je niets in, dan slaat het script die kanalen stilletjes over en blijft het logboek de bron van waarheid.

### Mail-ontvangers en afzender

Staan in `config.yaml` onder `mail:`. Pas die aan voor je redactie.

## Hoe wordt de "hoofdaflevering" gekozen?

Per feed: de aflevering met `pubDate` van vandaag (NL-tijd) met de **langste duur** (`itunes:duration`). Korte oproepjes en trailers vallen daarmee in de regel af. Als geen enkele aflevering van vandaag is gepubliceerd voor een feed, wordt die titel als "geen aflevering vandaag" gemeld in de poll en bevat de poll 3 opties in plaats van 4.

## Feeds aanpassen

`config.yaml` — voeg toe of vervang. De volgorde in `config.yaml` doet er niet toe; de poll husselt elke dag (deterministisch op datum, dus reproduceerbaar bij her-runs).
