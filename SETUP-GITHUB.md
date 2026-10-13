# GitHub einrichten: Klickschritte

**Stand 13.10.2026: alles erledigt.** Repo https://github.com/andibrack1046/news-hub, App https://andibrack1046.github.io/news-hub/, Pages-Source „GitHub Actions“, Workflow-Rechte „Read and write“, erster Lauf grün. `gh` liegt in `~/Developer/bin/gh` und ist mit dem Konto andibrack1046 angemeldet. Die Schritte unten bleiben als Nachschlagewerk, falls das Repo mal neu aufgesetzt werden muss. Offen ist nur Abschnitt 5 (optionaler KI-Key) und 6 (iPhone).

## 1. Leeres Repository auf GitHub anlegen

1. https://github.com/new öffnen (einloggen, falls nötig).
2. Repository name: `news-hub`
3. Public auswählen (GitHub Pages ist bei privaten Repos nur mit Bezahlplan möglich).
4. Keine Häkchen bei README, .gitignore oder Lizenz setzen (das Repo existiert schon lokal).
5. „Create repository“ klicken.

## 2. Lokales Repo hochladen

Im Terminal (ersetze `DEIN-NAME` durch deinen GitHub-Benutzernamen):

```bash
cd ~/Developer/news-hub && git remote add origin https://github.com/DEIN-NAME/news-hub.git && git push -u origin main
```

Beim ersten Push fragt macOS nach GitHub-Zugangsdaten. Passwort funktioniert nicht, du brauchst ein Token:
- https://github.com/settings/tokens → „Generate new token (classic)“ → Haken bei `repo` und `workflow` → erzeugen → kopieren.
- Im Terminal als Passwort einfügen. macOS merkt es sich im Schlüsselbund.

Alternative ohne Token: die App „GitHub Desktop“ installieren, dort „Add existing repository“ → Ordner `~/Developer/news-hub` → „Publish repository“.

## 3. GitHub Pages auf „GitHub Actions“ stellen

1. Im Repo: Settings → Pages (linke Spalte).
2. Unter „Build and deployment“ bei Source: **GitHub Actions** auswählen. Fertig, kein Speichern nötig.

## 4. Workflow einmal von Hand starten

1. Im Repo: Tab „Actions“.
2. Falls ein Hinweis „Workflows aren’t being run on this repository“ erscheint: „I understand my workflows, go ahead and enable them“ klicken.
3. Links „News aktualisieren und veröffentlichen“ anklicken → rechts „Run workflow“ → nochmal „Run workflow“.
4. Nach etwa einer Minute ist der Lauf grün. Die App liegt dann unter:

```
https://DEIN-NAME.github.io/news-hub/
```

Ab jetzt läuft der Workflow automatisch alle drei Stunden (Minute 17: 0:17, 3:17, 6:17 … UTC, also in Deutschland 1:17/2:17, 4:17/5:17 usw.).

## 5. Optional: KI-Zusammenfassungen einschalten

1. API-Key holen: https://console.anthropic.com → API Keys → „Create Key“.
2. Im Repo: Settings → Secrets and variables → Actions → „New repository secret“.
3. Name: `ANTHROPIC_API_KEY`, Secret: den Key einfügen → „Add secret“.
4. Beim nächsten Lauf bekommen die wichtigsten Meldungen einen Satz Zusammenfassung und einen Reel-Hook.

Kostendeckel anpassen (optional): Settings → Secrets and variables → Actions → Tab „Variables“ → „New repository variable“:
- `AI_MAX_ITEMS` (Standard 40 Meldungen pro Lauf)
- `AI_MODEL` (Standard `claude-haiku-5-5`)

Kostenschätzung steht in der README.

## 6. App aufs iPhone holen

1. Die Adresse `https://DEIN-NAME.github.io/news-hub/` in **Safari** öffnen (nicht Chrome, nur Safari kann Web-Apps installieren).
2. Teilen-Button (Quadrat mit Pfeil) → „Zum Home-Bildschirm“ → „Hinzufügen“.
3. Die App startet dann ohne Browserleiste, mit eigenem Icon, und funktioniert auch offline mit dem letzten Stand.

Am Mac: in Safari die Seite öffnen → Menü „Ablage“ → „Zum Dock hinzufügen“. In Chrome: Adressleiste → Symbol „Installieren“.

## Wenn etwas hakt

- Lauf rot bei „Seite veröffentlichen“: Schritt 3 prüfen (Pages-Source muss „GitHub Actions“ sein).
- Lauf rot bei „Datenstand committen“: Settings → Actions → General → „Workflow permissions“ auf „Read and write permissions“ stellen.
- Seite zeigt „Keine Daten“: der erste Workflow-Lauf ist noch nicht durch, oder er ist fehlgeschlagen (Tab Actions ansehen).
- Alte Version auf dem iPhone: App schließen und neu öffnen, beim zweiten Start ist der neue Stand da (Service Worker).
