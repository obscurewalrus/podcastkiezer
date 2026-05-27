# Podcastkiezer

Trekt elke dag de kop van de hoofdaflevering van **NRC Vandaag**, **De Dag (NOS)**, **Elke Dag (Volkskrant)** en **Dagkoersen (FD)**, husselt de volgorde, en serveert het op twee manieren:

1. **WhatsApp-poll-template** (+ optioneel Slack/mail) — om in een groep te plakken.
2. **Webinterface** op Cloudflare Pages waar mensen anoniem kunnen stemmen, met de bronnen pas zichtbaar na stem en een archief van eerdere polls.

## Architectuur

```
GitHub Actions (cron 14:00 UTC)
       │
       ▼ poll.py
out/YYYY-MM-DD.md   ← logboek (gecommit naar de repo)
out/YYYY-MM-DD.sql  ← INSERTs voor D1
       │
       ▼ wrangler d1 execute
Cloudflare D1 ◄──► Cloudflare Pages Functions (/api/*) ◄──► browser (web/)
```

## Lokaal draaien (alleen poll, geen webinterface)

```bash
pip install -r requirements.txt
python poll.py
```

Debug-vlaggen:

```bash
python poll.py --date 2026-05-26   # forceer een specifieke dag
python poll.py --no-send           # geen Slack/mail, alleen logboek + SQL
```

## GitHub Actions

`.github/workflows/poll.yml` draait dagelijks om **14:00 UTC** (= 15:00 wintertijd / 16:00 zomertijd in NL — GitHub Actions cron ondersteunt geen DST). Aanpassen kan via de `cron`-regel.

Scheduled workflows draaien **alleen vanaf de default branch**, dus deze branch moet naar `main` gemerged worden voor de cron daadwerkelijk start. Handmatig testen kan vanaf elke branch via **Actions → Daily poll → Run workflow**.

## Webinterface op Cloudflare Pages

Eenmalig opzetten. Je hebt een Cloudflare-account nodig (gratis).

### 1. Lokaal Wrangler installeren

```bash
npm install -g wrangler
wrangler login   # opent een browser
```

### 2. D1-database aanmaken

```bash
wrangler d1 create podcastkiezer-db
```

De output bevat een `database_id`. Plak die in `wrangler.toml` op de plek van `REPLACE_WITH_REAL_ID` en commit dat.

### 3. Schema laden

```bash
wrangler d1 migrations apply podcastkiezer-db --remote
```

### 4. Pages-project koppelen aan deze repo

In de Cloudflare-dashboard:

- **Workers & Pages → Create → Pages → Connect to Git** → kies deze repo.
- Build settings: **Build command** leeg laten, **Build output directory** = `web`.
- Na het eerste deploy: **Settings → Functions → D1 database bindings → Add binding**:
  - Variable name: `DB`
  - D1 database: `podcastkiezer-db`
- Trigger één **Retry deployment** zodat de binding actief wordt.

De site is dan bereikbaar op `https://podcastkiezer.pages.dev` (of de custom domain die je instelt).

### 5. GitHub Actions toegang geven tot D1

In Cloudflare-dashboard: **My Profile → API Tokens → Create Token**. Gebruik de template **"Edit Cloudflare Workers"** (of een custom token met `Account: D1: Edit` permission). Kopieer het token.

Je `Account ID` staat rechtsboven in de Cloudflare-dashboard (URL of sidebar).

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Waarde |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Het token van net |
| `CLOUDFLARE_ACCOUNT_ID` | Je Cloudflare account-ID |
| `D1_DATABASE_NAME` | `podcastkiezer-db` (alleen nodig als je een andere naam gebruikt) |

Zodra deze twee secrets gezet zijn, pusht de workflow elke run de poll naar D1 en wordt de webinterface bijgewerkt. Zonder deze secrets blijft de poll lokaal in `out/` en doet de workflow gewoon de markdown/Slack/mail.

### 6. (Optioneel) Slack & mail

Zelfde secrets-pagina:

| Secret | Wanneer |
| --- | --- |
| `SLACK_WEBHOOK_URL` | Voor Slack-bericht. Maak een Incoming Webhook in Slack. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Voor e-mail. `SMTP_STARTTLS=false` zet TLS uit (default aan). |

Mail-ontvangers en afzender staan in `config.yaml` onder `mail:`.

## Hoofdaflevering versus oproepjes

Per feed neemt het script de aflevering met `pubDate` van vandaag (NL-tijd) met de **langste duur** (`itunes:duration`). Korte trailers en oproepjes vallen daarmee in de regel af. Als geen enkele aflevering van vandaag is gepubliceerd voor een feed, wordt die titel als "geen aflevering vandaag" gemeld in de poll en bevat de poll 3 opties in plaats van 4.

## Feeds aanpassen

`config.yaml` — voeg toe of vervang. De volgorde in `config.yaml` doet er niet toe; de poll husselt elke dag (deterministisch op datum, dus reproduceerbaar bij her-runs).
