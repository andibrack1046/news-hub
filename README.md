# News-Hub

Persönlicher News-Hub für Andi: sammelt mehrmals täglich Meldungen aus öffentlichen Feeds (Social Media, KI für Creator, Video und Gear, Marketing, Trends, Region Hannover) und hilft, daraus Videoideen zu machen. Läuft als PWA auf GitHub Pages, ohne Login, ohne Datenbank.

## Aufbau

```
sources.json          Quellen und Kategorien (hier neue Feeds eintragen)
scripts/fetch.mjs     Feeds abrufen, bereinigen, bündeln, bewerten -> public/data/news.json
scripts/serve.mjs     lokale Vorschau (http://localhost:4173)
scripts/lib/          Parser (RSS/Atom/RDF), Textwerkzeuge, Schlagwort-Klassifizierung
scripts/test/         Tests (npm test)
public/               die Web-App (wird auf GitHub Pages ausgeliefert)
public/data/news.json aktueller Datenstand
```

Keine npm-Abhängigkeiten. Node 20 oder neuer.

## Lokal ausführen

```bash
npm run fetch     # Feeds holen, news.json schreiben (ca. 5 Sekunden)
npm run serve     # Vorschau unter http://localhost:4173
npm test          # Parser- und Klassifizierungstests
```

## Quelle hinzufügen

Eintrag in `sources.json` unter `sources` ergänzen:

```json
{ "id": "mein-feed", "name": "Mein Feed", "type": "rss", "url": "https://example.com/feed", "category": "video", "weight": 1.0, "lang": "de" }
```

Felder:

| Feld | Bedeutung |
|---|---|
| `type` | `rss` (auch Atom/RDF), `googlenews` (mit `query`), `hn` (Hacker News, mit `query` oder `frontPage`), `gtrends` (Google Trends RSS) |
| `category` | `social`, `ki`, `video`, `marketing`, `trends`, `region` |
| `weight` | Gewicht für die Heute-Ansicht. 1.0 normal, 1.3 wichtig, 0.7 Hintergrundrauschen |
| `classify` | `true`: Kategorie wird per Schlagwort aus der Schlagzeile bestimmt (für Mischquellen wie heise) |
| `onlyMatching` | `true`: nur Meldungen behalten, die zu irgendeiner Kategorie passen |
| `keywords` | Liste: nur Meldungen behalten, die eins dieser Wörter enthalten (z. B. Ortsnamen bei Regionalzeitungen) |
| `days` | nur `googlenews`: Zeitraum in Tagen (Standard 2) |
| `max` | maximale Meldungen pro Lauf (Standard 30, Google News 15) |
| `enabled` | `false` schaltet die Quelle ab, ohne sie zu löschen |

Schlagwortlisten für die Klassifizierung stehen in `scripts/lib/classify.mjs`.

## Datenformat (`public/data/news.json`)

```json
{
  "generatedAt": "2026-10-13T08:46:30.000Z",
  "categories": [{ "id": "social", "label": "Social Media" }],
  "stats": { "total": 346, "newThisRun": 12, "perCategory": {}, "sourcesOk": 46, "sourcesFailed": [] },
  "sources": [{ "id": "heise", "ok": true, "count": 21, "error": null }],
  "items": [{
    "id": "e6881bad08dd", "title": "…", "url": "…", "source": "heise online", "sourceId": "heise",
    "category": "ki", "lang": "de", "publishedAt": "…", "firstSeenAt": "…", "summary": "…",
    "score": 1.42, "related": 2, "clusterId": "e6881bad08dd", "lead": true, "ai": null
  }]
}
```

`lead: true` ist die führende Meldung eines Bündels ähnlicher Schlagzeilen, `related` die Zahl der weiteren. `ai` ist `null` oder `{ summary, hook, model, at }`.

## Veröffentlichung: GitHub Pages + Actions

Der Workflow `.github/workflows/update.yml` läuft alle drei Stunden, bei jedem Push auf `main` und von Hand (Tab Actions → Run workflow):

1. Feeds abrufen (`scripts/fetch.mjs`)
2. optional KI-Texte (`scripts/summarize.mjs`, nur wenn das Secret `ANTHROPIC_API_KEY` existiert)
3. `public/data/news.json` ins Repo committen (Bot-Commit „Daten: …“)
4. `public/` als GitHub-Pages-Seite veröffentlichen

Einmalige Einrichtung mit Klickschritten: siehe `SETUP-GITHUB.md`. Wichtig: Settings → Pages → Source auf **GitHub Actions**.

Adresse danach: `https://DEIN-NAME.github.io/news-hub/`. Die App nutzt nur relative Pfade und läuft deshalb in jedem Unterordner.

## KI-Zusammenfassungen (optional)

`scripts/summarize.mjs` schickt die wichtigsten neuen Meldungen (ohne `ai`, führend im Bündel, jünger als 48 Std., nach `score`) in Paketen zu 8 an Claude und bekommt pro Meldung einen Satz Zusammenfassung und einen Reel-Hook auf Deutsch zurück (strukturierte JSON-Ausgabe). Ohne Key wird der Schritt übersprungen, die App läuft unverändert.

Kostendeckel:

| Variable | Standard | Bedeutung |
|---|---|---|
| `ANTHROPIC_API_KEY` (Secret) | leer | ohne Key kein KI-Schritt |
| `AI_MAX_ITEMS` (Variable) | 40 | Meldungen pro Lauf |
| `AI_MAX_REQUESTS` | 8 | Anfragen pro Lauf (8 × 8 = 64 Meldungen Obergrenze) |
| `AI_MODEL` (Variable) | `claude-haiku-5-5` | günstiges Modell; `claude-sonnet-5-5` für bessere Hooks |

Kostenschätzung mit Haiku 5.5 (0,10 USD je Mio. Input-Token, 0,50 USD je Mio. Output-Token): pro Meldung ca. 150 Token Input und 80 Token Output, plus ca. 400 Token Systemprompt je Anfrage (gecacht). 40 Meldungen pro Lauf ≈ 9.000 Input- + 3.200 Output-Token ≈ **0,003 USD pro Lauf**. Bei 8 Läufen am Tag, meist mit weniger neuen Meldungen: **unter 1 USD im Monat**. Mit Sonnet 5.5 etwa das 20-fache, also rund 10 bis 15 USD im Monat. Die tatsächlichen Token stehen nach jedem Lauf im Actions-Log und in `news.json` unter `ai.estimatedCostUsd`.

Lokal testen: `ANTHROPIC_API_KEY=sk-… npm run summarize` (nach `npm install` und `npm run fetch`).

## Offline, Cache, Aktualität

- Service Worker (`public/sw.js`): App-Dateien kommen aus dem Cache und werden im Hintergrund erneuert, `news.json` wird zuerst vom Netz geholt, bei Ausfall vom letzten Stand. Neue App-Version: beim zweiten Öffnen aktiv.
- Kopfzeile zeigt „Stand vor 2 Std.“ (Zeitpunkt des letzten Workflow-Laufs) und ob Quellen gestört sind.
- Beim Zurückkehren zur App (nach über einer Minute) werden die Daten neu geladen.
- Gemerktes, Ideen, Notizen und Erledigt-Markierungen liegen nur im Browser dieses Geräts (`localStorage`). Kein Login, keine Synchronisation. Export der Ideen als Markdown für Obsidian.

## Auf iPhone und Mac installieren

Siehe `SETUP-GITHUB.md`, Abschnitt 6: in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
