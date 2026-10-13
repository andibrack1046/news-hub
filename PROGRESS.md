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
