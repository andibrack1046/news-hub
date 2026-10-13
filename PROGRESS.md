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

## Etappe 3: GitHub Pages + Actions (13.10.2026, vorbereitet)
- `.github/workflows/update.yml`: Zeitplan alle 3 Std. (Minute 17), `workflow_dispatch`, Push auf main. Schritte: npm ci, fetch, optional summarize (nur wenn Secret vorhanden), Datenstand committen, `upload-pages-artifact` + `deploy-pages`.
- Abends erledigt: `gh` 2.102.0 nach `~/Developer/bin` installiert (Prüfsumme geprüft), per Gerätecode mit Andis Konto verbunden (Scopes repo, workflow). Repo `andibrack1046/news-hub` angelegt, Workflow-Rechte auf write, Pages auf `build_type=workflow`, Push.
- Erster Lauf scheiterte sofort: `secrets`-Kontext ist in `steps[].if` nicht erlaubt. Fix: Secret als Job-`env`, Prüfung über `env.ANTHROPIC_API_KEY`. Zweiter Lauf grün: 46/46 Quellen, 488 Meldungen, Bot-Commit „Daten: …“, Seite live unter https://andibrack1046.github.io/news-hub/ (index, sw.js, manifest, news.json alle 200; 8 Karten in der Heute-Ansicht).
- Klickschritte in `SETUP-GITHUB.md` bleiben als Nachschlagewerk.

## Etappe 5: KI-Zusammenfassung und Hooks (13.10.2026)
- `scripts/summarize.mjs` mit `@anthropic-ai/sdk` (einzige Abhängigkeit), Modell `claude-haiku-5-5`, strukturierte JSON-Ausgabe, Effort low, Systemprompt gecacht.
- Deckel: `AI_MAX_ITEMS` (40), `AI_MAX_REQUESTS` (8), nur Leads jünger als 48 Std. ohne vorhandenen KI-Text. Kostenschätzung in README (unter 1 USD/Monat mit Haiku).
- Fehler brechen die Veröffentlichung nie ab (Exit 0, Log). Ohne Key: Schritt übersprungen, getestet. Mit Key noch nicht live getestet (kein Key auf diesem Mac), das muss der erste GitHub-Lauf zeigen.
- Oberfläche zeigt `ai.summary` und `ai.hook` (mit Balken „Hook“) auf der Karte und in der Ideenliste; Hook landet im Markdown-Export.

## Etappe 6: Feinschliff (13.10.2026)
- Service Worker in echtem Chrome geprüft: registriert, App-Hülle und news.json im Cache, 8 Karten. Server gestoppt und neu geladen: Seite kommt aus dem Cache, Kopfzeile zeigt „Offline · Stand vor 15 Min.“ (Kennzeichen `x-newshub-offline` auf der Cache-Antwort).
- Darstellung der KI-Texte mit Testdaten geprüft (Zusammenfassung plus Hook-Balken in der Karte), Testdaten danach wieder entfernt.
- Kaputte Feeds: pro Quelle Timeout 20 s, Fehler werden geloggt und in `news.json` unter `sources[].error` und `stats.sourcesFailed` vermerkt, die App zeigt „n Quellen gestört“. Alter Stand bleibt 7 Tage erhalten. Nur wenn keine einzige Quelle antwortet, schlägt der Lauf fehl.
- Ladezeit: keine Frameworks, keine Webfonts, eine JSON-Datei (ca. 220 KB, von GitHub Pages gzip-komprimiert), App-Dateien aus dem Cache.
- Quellen in einer Datei (`sources.json`), Schlagwortlisten in `scripts/lib/classify.mjs`, Erklärung in README.
- Workflow-YAML validiert (ruby yaml), Tests laufen auch im Workflow.
- Übergabe geschrieben: `~/Obsidian/Mein Leben/2026-10-13 Übergabe News-Hub.md`.
- Nicht geprüft, weil nicht möglich: echter GitHub-Lauf, KI-Schritt mit Key, Installation auf dem iPhone.

## Umbau auf Zeitungslayout (13.10.2026, abends)
Andis Rückmeldung: Kartenliste gibt keinen Überblick, soll aussehen wie ein echter News-Hub mit Bildern.
- Bilder: `scripts/lib/feed.mjs` zieht `media:content`, `media:thumbnail`, `enclosure`, `itunes:image` oder das erste `<img>` aus dem Feed. Für Meldungen ohne Feed-Bild holt `fetch.mjs` das `og:image` der Artikelseite (max. 80 pro Lauf, nur Kopf der Seite, einmal pro Meldung, Merker `imageChecked`).
- Google News: Weiterleitungs-URLs werden über Googles `batchexecute` in echte Artikel-URLs aufgelöst (`scripts/lib/gnews.mjs`, Cache `public/data/gnews-cache.json`, max. 60 neue pro Lauf). Dadurch echte Links, Dubletten mit Direkt-Feeds werden erkannt, und die Artikel bekommen Bilder. Lauf dauert jetzt ca. 15 s statt 3 s.
- Start: Aufmacher (großes Bild, Kicker im Weinrot-Balken, Headline, Teaser), Top-Themen-Raster (6 Kacheln mit Bild), pro Ressort ein Block mit Bild-Aufmacher und 4 Kurzmeldungen mit Thumbnails, Ticker (Desktop: rechte Spalte, fest; mobil: unten). Max. 2 pro Ressort und 2 pro Quelle oben, Aufmacher bevorzugt mit Bild.
- Kopf wie eine Zeitung: Wortmarke, Datum und Stand, Ressortleiste mit Unterstreichung (Start, 6 Ressorts, Neueste, Gemerkt, Ideen). Unten mobil weiter die vier Tabs.
- Ressortseiten (`#ressort/<id>`): Aufmacher plus Liste, zweispaltig ab 1060 px. Neueste: Suche, Pillen-Filter, Liste mit Thumbnails. Merken/Videoidee/Erledigt als Pillen bei Aufmachern, als kleine Textschaltflächen in Listen.
- Platzhalter ohne Bild: dunkle Fläche mit Quellenname (Kacheln); in Listen entfällt das Thumbnail.
- Suchen nachgeschärft: „Runway“ fand Flughafen-Landebahnen, jetzt „Runway ML/AI“; Google Trends mit weniger Gewicht, Ticker höchstens 2 Einträge pro Quelle.
- Service-Worker-Cache auf v2, damit alle Geräte die neue Oberfläche bekommen.
