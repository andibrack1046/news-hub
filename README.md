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

`lead: true` ist die führende Meldung eines Bündels ähnlicher Schlagzeilen, `related` die Zahl der weiteren. `ai` wird in Etappe 5 optional mit Zusammenfassung und Hook gefüllt.
