# Fortschritt News-Hub

Kurzprotokoll pro Etappe. Details und Bedienung stehen in der README.

## Etappe 1: Repo, Feed-Abruf, JSON (13.10.2026)
- Repo angelegt in `/Volumes/PRivat/News Hub App` (Symlink `~/Developer/news-hub` zeigt darauf).
- `scripts/fetch.mjs` holt 46 Quellen aus `sources.json` (RSS, Atom, RDF, Google-News-Suchen, Hacker News, Google Trends), ohne npm-Abhängigkeiten.
- Bereinigung: Tracking-Parameter weg, gleiche Schlagzeilen zusammengelegt, ähnliche Meldungen gebündelt (`clusterId`, `lead`), Bewertung (`score`) aus Quellengewicht, Aktualität und Anzahl ähnlicher Meldungen.
- Kategorisierung per Schlagwort für Mischquellen (heise, t3n, OMR …), Google-News-Treffer müssen in der Schlagzeile zum Thema passen.
- Ausgabe `public/data/news.json`, letzter Stand wird gemerkt (7 Tage), damit nichts verschwindet, wenn ein Feed ausfällt.
- Tests: `npm test` (Parser, Normalisierung, Klassifizierung). Lokaler Lauf: 46/46 Quellen ok, ca. 350 Meldungen, 3 Sekunden.
- Nicht aufgenommen: Reddit (blockt Abrufe ohne Login mit 403), TikTok Newsroom und Anthropic (kein RSS), DPReview (Bot-Schutz).

## Etappe 2: PWA-Oberfläche (13.10.2026)
- `public/`: index.html, styles.css, app.js, manifest.webmanifest, sw.js. Kein Framework, keine Abhängigkeiten, relative Pfade (läuft unter `/news-hub/` auf GitHub Pages).
- Ansichten: Heute (5 bis 8 Top-Meldungen der letzten 36 Std., max. 3 pro Kategorie und 2 pro Quelle, plus „Außerdem“ je Kategorie), Alle (Kategorie-Pillen, Suche, Erledigte ein-/ausblenden, Nachladen), Gemerkt, Ideen.
- Karte: Titel als Link, Kategorie · Quelle · Zeit („vor 2 Std.“), Teaser, ähnliche Meldungen aufklappbar, Pillen Merken / Videoidee / Erledigt. „Neu“ markiert Meldungen seit dem letzten Besuch.
- Design nach Vorgabe: #15161A, Karten #1B1C21/#212228, Stein-Text, Weinrot-Akzent, Systemschrift (SF Pro, sonst Inter), 20 px Karten, Pillen, eckiger Balken für ein Wort. Keine Icons, Emojis, Labels, Verläufe.
- Mobil: Tab-Leiste unten mit Safe-Area, 390 px geprüft. Desktop: Tabs im Kopf, zweispaltige Listen ab 900 px.
- Offline: Service Worker (App-Hülle stale-while-revalidate, news.json netz-zuerst mit Rückfall). Im eingebetteten Vorschau-Browser ließ sich der SW nicht registrieren, Prüfung auf echtem Gerät steht aus.

## Etappe 4 (vorgezogen, zusammen mit 2): Merken, Ideen, Markdown-Export
- Zustand in `localStorage` (`newshub.v1`): Merkliste und Ideen als Kopien der Meldung (bleiben nach 7 Tagen erhalten), Erledigt-Markierungen, Filter, letzter Besuch.
- Ideenliste mit Notizfeld (speichert beim Tippen), „Gedreht“, Entfernen, eigene Idee ohne Meldung anlegen.
- Export: „Als Markdown kopieren“ (Zwischenablage) und „Markdown-Datei“ (iOS: Teilen-Dialog, sonst Download `JJJJ-MM-TT Videoideen News-Hub.md`). Format: eine `##`-Überschrift pro Idee mit Status, Quelle, Link, Kategorie, Hook, Notiz.
