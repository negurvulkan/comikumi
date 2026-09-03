# ComiKumi — Benutzerhandbuch

*[English version](User-Guide.md)*

*Eine aufgabenorientierte Anleitung: wie erledige ich X in ComiKumi? Für die
vollständige technische Feature-Referenz siehe [FEATURES.de.md](FEATURES.de.md).*

## Inhalt

1. [Einführung](#1-einführung)
2. [Erste Schritte](#2-erste-schritte)
3. [Projekte, Bände und Seiten](#3-projekte-bände-und-seiten)
4. [Der Editor: Grundlagen](#4-der-editor-grundlagen)
5. [Sprechblasen erstellen und bearbeiten](#5-sprechblasen-erstellen-und-bearbeiten)
6. [Weitere Elemente: Bilder, Kurventext, Panels](#6-weitere-elemente-bilder-kurventext-panels)
7. [Japanisches Lettering](#7-japanisches-lettering)
8. [Panel-Inhalte bearbeiten (Cut-Panel)](#8-panel-inhalte-bearbeiten-cut-panel)
9. [Automatische Werkzeuge: Auto-Bubbles, Bereinigung, KI](#9-automatische-werkzeuge-auto-bubbles-bereinigung-ki)
10. [Mehrsprachig arbeiten](#10-mehrsprachig-arbeiten)
11. [Organisation: Charaktere, Story Bible, Glossar, Presets](#11-organisation-charaktere-story-bible-glossar-presets)
12. [Planung: der Skript-Editor](#12-planung-der-skript-editor)
13. [Qualitätssicherung und Zusammenarbeit](#13-qualitätssicherung-und-zusammenarbeit)
14. [Export und Veröffentlichung](#14-export-und-veröffentlichung)
15. [Konten, Rollen und Mehrbenutzerbetrieb](#15-konten-rollen-und-mehrbenutzerbetrieb)
16. [Einstellungen und Anpassung](#16-einstellungen-und-anpassung)
17. [Tastenkürzel](#17-tastenkürzel)

---

## 1. Einführung

ComiKumi ist ein Werkzeug für die Lokalisierung und das Lettering von
Manga/Comics: Du lädst gescannte Seiten hoch, platzierst Sprechblasen,
übersetzt sie in beliebig viele Sprachen und exportierst fertige,
druckfähige Seiten — alles lokal, ohne dass deine Daten einen Server
verlassen, den du nicht selbst kontrollierst.

Ein typischer Arbeitsablauf sieht so aus:

1. **Projekt anlegen** — einmalig, verweist auf einen Ordner mit deinen
   gescannten Seiten.
2. **Band öffnen, Seiten hochladen** (oder bereits vorhandene Scans
   erkennen lassen).
3. **Seite lettern** — Sprechblasen zeichnen (von Hand oder automatisch
   erkennen lassen), Text eintippen oder übersetzen.
4. **Prüfen** — QA-Checks, Kommentare/Review, Berichte.
5. **Exportieren** — als PNG, druckfähiges TIFF, Vektor-PDF, geschichtetes
   PSD oder fertiges CBZ.

Dieses Handbuch führt dich Schritt für Schritt durch jeden dieser Punkte.
Wenn du stattdessen genau wissen willst, *wie* ein Feature technisch
funktioniert (z. B. welche Datei wo gespeichert wird), lies
[FEATURES.de.md](FEATURES.de.md) — das ist die vollständige technische
Referenz.

## 2. Erste Schritte

### 2.1 Installation

Du hast zwei Möglichkeiten:

**A) Desktop-App (einfachster Weg)**: Falls für dich ein fertiger Installer
bereitgestellt wurde (Windows/macOS/Linux), führe ihn aus wie jede andere
Anwendung — ComiKumi startet danach als normales Programm, mit einem
eigenen Fenster. Alle deine Projektdaten landen automatisch in einem
privaten Ordner deines Benutzerkontos, nicht im Installationsverzeichnis.

**B) Selbst aus dem Quellcode bauen (für Entwickler/selbst gehostete
Server)**: Voraussetzung ist Node.js 18 oder neuer.

```bash
npm install
npm run dev
```

Das installiert Client und Server und startet beide zusammen (Server auf
Port 3001, Client auf Port 5173). Öffne die im Terminal angezeigte Adresse
im Browser. Willst du selbst einen Desktop-Installer bauen, nutze
`npm run electron:build` — Details siehe [README.md](../README.md).

### 2.2 Erstes Konto anlegen

Beim allerersten Start (noch existiert kein Konto auf diesem Server) zeigt
ComiKumi statt eines Logins einen Ersteinrichtungs-Bildschirm. Vergib einen
Benutzernamen und ein Passwort — dieses erste Konto wird automatisch
**Systemadministrator** und kann später weitere Konten anlegen (siehe
[Kapitel 15](#15-konten-rollen-und-mehrbenutzerbetrieb)).

### 2.3 Erstes Projekt anlegen

Nach der Anmeldung siehst du den **Projekt-Umschalter**. Klicke auf
"Neues Projekt", der **Projekt-Wizard** führt dich durch fünf Schritte:

1. **Grundlagen**: ein Name fürs Projekt, wo die Projektdatei gespeichert
   werden soll, und dein **Scan-Ordner** — der Ordner, in dem deine
   gescannten Seiten liegen (oder liegen werden).
2. **Ordner-Namenskonvention**: wie ComiKumi Unterordner benennt (z. B.
   `_empty` für unübersetzte Rohscans, `_german` für die deutsche Version).
   Die Vorgaben passen für die meisten Projekte — änderbar, falls du eine
   andere Konvention brauchst.
3. **Sprachen**: mit welchen Sprachen du arbeiten willst. Du kannst
   jederzeit später weitere hinzufügen — hier reicht es, mit einer
   Sprache zu starten, falls du (noch) nicht mehrsprachig arbeitest.
4. **Erste Bände**: optional gleich ein oder mehrere Bände/Kapitel
   anlegen — der Wizard legt dafür automatisch die passenden Ordner an.
5. **Zusammenfassung**: prüfen und bestätigen — erst hier wird die
   eigentliche Projektdatei geschrieben.

Fehlt dein Scan-Ordner noch, kannst du ihn direkt im Wizard anlegen lassen.
Ein eingebauter Datei-Browser hilft beim Navigieren, falls du dir beim
genauen Pfad unsicher bist.

**Danach**: dein Projekt ist eine einzelne `.json`-Datei, die alle
Einstellungen, Sprachen, Charaktere usw. bündelt — sie lässt sich also
problemlos kopieren, sichern oder mit anderen teilen (die eigentlichen
Bilddateien liegen separat im Scan-Ordner).

### 2.4 Ein bestehendes Projekt öffnen

Im Projekt-Umschalter siehst du eine Liste zuletzt geöffneter Projekte —
ein Klick öffnet sie erneut. Alternativ kannst du über "Projekt öffnen"
direkt den Pfad zu einer `projekt.json`-Datei angeben.

## 3. Projekte, Bände und Seiten

### 3.1 Was ist ein "Band"?

Ein **Band** entspricht einem Comic-Kapitel/-Volume — technisch: ein
Ordner mit dem konfigurierten "Leer"-Suffix (z. B. `volume_01_empty`) in
deinem Scan-Ordner. ComiKumi durchsucht deinen Scan-Ordner automatisch
danach; jeder passende Ordner erscheint als eigene Karte in der
Band-Liste.

### 3.2 Seiten hochladen

Öffne einen Band, dann **Seite → Seiten hochladen…**. Du kannst direkt aus
dem Browser einen oder mehrere Seiten-Scans hochladen — praktisch, sobald
Client und Server nicht auf demselben Rechner laufen (sonst könntest du
die Dateien auch einfach direkt in den Scan-Ordner kopieren). Existiert
bereits eine Datei mit demselben Namen, fragt ComiKumi nach, bevor sie
überschrieben wird.

**Eine Seite löschen**: der "Löschen"-Button auf jeder Seiten-Karte entfernt
nur die Bilddatei — sie landet nicht destruktiv verschieb­bar in einem
Papierkorb-Ordner (Standard-Aufbewahrung: 30 Tage, einstellbar unter
Projekteinstellungen). Eine für diese Seite bereits gespeicherte
Lettering-Datei (deine Blasen/Panels) bleibt dabei erhalten.

### 3.3 Eine leere Seite anlegen

Statt einen Scan hochzuladen, kannst du über **Seite → Leere Seite…** auch
eine komplett leere (weiße) Seite in einer von dir gewählten Größe
anlegen — nützlich, wenn eine Seite nicht aus einem Gesamtscan entsteht,
sondern Panel für Panel aus einzelnen, bereits fertigen Grafiken
zusammengesetzt werden soll (siehe [Kapitel 6.3](#63-panels) und die
Panel-Raster-Vorlagen im Editor).

### 3.4 Kapitel

Kapitel sind ein leichtgewichtiges Tagging pro Seite (nicht mehr) — über
**Seite → Kapitel verwalten** legst du Kapitel an, jede Seiten-Karte hat
danach ein Dropdown zum Zuweisen. Vorteile:

- Die Seitenübersicht gruppiert Seiten optisch nach Kapitel.
- Der Export-Dialog bekommt eine "Kapitel"-Auswahl (exportiert nur die
  Seiten dieses Kapitels).
- CBZ-Exporte bekommen automatisch Kapitel-Lesezeichen (funktioniert mit
  Readern wie Komga/Kavita).
- Band-Bericht und QA-Check lassen sich nach Kapitel filtern.

Die *Reihenfolge* der Kapitel folgt immer der tatsächlichen Seitenreihenfolge
— du legst sie also nicht separat fest.

## 4. Der Editor: Grundlagen

Ein Klick auf eine Seiten-Karte öffnet den **Editor** — hier findet die
eigentliche Arbeit statt.

### 4.1 Navigieren

- **Zoomen**: Mausrad (zoomt zum Mauszeiger hin), oder die +/- -Buttons in
  der Statusleiste.
- **Verschieben**: auf leerer Fläche ziehen.
- **Auswählen**: Klick auf ein Element wählt es aus; Shift-Klick fügt
  weitere Elemente zur Auswahl hinzu. Klick auf leere Fläche hebt die
  Auswahl auf.

### 4.2 Elemente bearbeiten

Jedes ausgewählte Element zeigt Ziehgriffe zum Verschieben/Skalieren/
Rotieren. Rechtsklick öffnet ein Kontextmenü (Duplizieren, Löschen, Panel-
oder Charakter-Zuweisung, je nach Elementtyp).

### 4.3 Die Werkzeugleiste

Am linken Rand findest du Werkzeuge zum Anlegen neuer Elemente (Blasen in
drei Formen, Effekt-Blase, Bild, Kurventext, Panel) sowie Umschalter für
die Seitenleisten (Text-Liste, Ebenen-Navigator, Kontextansicht, Story
Bible, KI-Assistent, Kommentare) und die Automatisierungs-Werkzeuge
(Auto-Bubbles, Seite bereinigen — siehe [Kapitel 9](#9-automatische-werkzeuge-auto-bubbles-bereinigung-ki)).

### 4.4 Speichern

Nichts wird automatisch auf die Festplatte geschrieben — klicke aktiv auf
**Speichern**, sobald du mit einem Bearbeitungsschritt zufrieden bist.

**Wichtig bei Teamarbeit**: Hat eine andere Person dieselbe Seite in der
Zwischenzeit ebenfalls gespeichert, erscheint beim Speichern ein Dialog
statt eines stillen Überschreibens — du wählst dann zwischen "Meine
Version behalten" oder "Andere Version laden". Mehr dazu in
[Kapitel 15](#15-konten-rollen-und-mehrbenutzerbetrieb).

### 4.5 Rückgängig machen

**Strg+Z** macht den letzten Schritt rückgängig, **Strg+Y** (oder
**Strg+Umschalt+Z**) stellt ihn wieder her — bis zu 50 Schritte zurück.
Zusammenhängende Aktionen (z. B. während des Tippens) zählen dabei als
ein Schritt, nicht einer pro Tastendruck.

## 5. Sprechblasen erstellen und bearbeiten

### 5.1 Eine Blase zeichnen

Wähle in der Werkzeugleiste eine Form (Rechteck, Oval, oder "Viereck" für
frei verzerrbare Perspektive, z. B. ein schräg gesehenes Schild) und ziehe
auf dem Canvas ein Rechteck auf — daraus entsteht die neue Blase.

### 5.2 Text eintippen

Öffne die **Text-Liste** (Werkzeugleiste) oder klicke direkt auf die Blase
und nutze den Inspector am rechten Rand. Tippe deinen Text ein — bei
mehreren Projektsprachen wechselst du über die **Sprachleiste** (links
neben der Text-Seitenleiste), welche Sprache du gerade bearbeitest.

### 5.3 Aussehen anpassen

Im Inspector der ausgewählten Blase stellst du ein:

- **Hintergrundstil**: keine (unsichtbar, für bereits vorhandene Grafik),
  Sprechblase, Gedankenblase, Effekt (gezackter Rand), oder eine eigene
  hochgeladene SVG-Kontur.
- **Füll-/Randfarbe, Randbreite.**
- **Zeiger/Schwanz** (bei sichtbarem Stil): nahtlos, freistehend, oder eine
  segmentierte "Kette" — Position, Breite und Krümmung direkt auf dem
  Canvas ziehbar.
- **Text**: Schriftart, Größe, Zeilenhöhe, Ausrichtung, Leserichtung, Farbe,
  optional Umrandung oder Farbverlauf.

### 5.4 Effekt-Blasen (SFX)

Für Soundeffekte/Onomatopoetika gibt es ein eigenes Werkzeug direkt neben
den drei Formen — es zeichnet eine Blase wie das Rechteck-Werkzeug,
markiert sie aber zusätzlich als Soundeffekt statt gesprochenen Dialog.
Eine bestehende Blase lässt sich über eine Checkbox im Inspector
nachträglich umschalten. Effekt-Blasen fallen automatisch aus "Wer sagt
was"-Berichten, automatisch generierten Skript-Dialogzeilen und der
QA-Prüfung "fehlende Übersetzung" heraus — für sie ergibt das keinen Sinn.

### 5.5 Blasen anschneiden

Soll eine Blase sauber an einer Panelkante enden? Nutze im Inspector den
Button **"Anschneiden"** — ziehe die Schnittlinie frei auf dem Canvas, oder
klicke **"An Panelkante ausrichten"** für einen automatischen Vorschlag.
Ein "Flip"-Umschalter kehrt um, welche Seite behalten wird. Text rückt
automatisch von der abgeschnittenen Kante ab.

### 5.6 Blasen verschmelzen

Mehrere Blasen zu einer durchgehenden Form verschmelzen (z. B. zwei
überlappende Ovale zu einer "Achter"-Form): wähle alle betroffenen Blasen
per Shift-Klick aus, dann im Mehrfachauswahl-Inspector **"Blasen
verschmelzen"**. Die zuerst ausgewählte Blase trägt danach den
gemeinsamen Text. **"Verschmelzung aufheben"** stellt jede Original-Blase
mit ihrem eigenen früheren Text wieder her — nichts geht dabei verloren.

### 5.7 Feinschliff: Innenabstand und Zeilenumbruch

- **Innenabstand** (Abstand Blasenumriss ↔ Text): eine Checkbox im
  Inspector erlaubt einen eigenen Wert per Schieberegler, statt des
  automatischen Standards — praktisch, wenn eine Übersetzung besonders eng
  oder großzügig wirkt.
- **Formangepasster Zeilenumbruch** (nur ovale Blasen): eine Checkbox lässt
  jede Zeile ihre Breite aus der tatsächlichen Ellipsenform ableiten,
  statt aus einem festen Rechteck — sinnvoll bei Übersetzungen mit
  besonders viel Text.

## 6. Weitere Elemente: Bilder, Kurventext, Panels

### 6.1 Platzierte Bilder

Über das Bild-Werkzeug fügst du ein Rasterbild ein, das sich frei in ein
Viereck verzerren lässt (gleicher Mechanismus wie bei "Viereck"-Blasen) —
für Dinge, die Text allein nicht abdecken kann, etwa ein neu gezeichnetes
Schild. Du kannst pro Sprache eine unterschiedliche Bilddatei hinterlegen.

### 6.2 Kurventext

Für freistehende Titel/Effekttexte entlang einer Kurve (z. B. ein
logoartiger Kapiteltitel oder "BOOM!" entlang einer Bewegungslinie) —
das Kurventext-Werkzeug legt vier ziehbare Kontrollpunkte an, der Text
folgt automatisch der resultierenden Kurve.

### 6.3 Panels

Panels sind reine Editor-Anmerkungen, die einen Comic-Panel markieren —
sie erscheinen **nie** im PNG-Export, dienen aber als Grundlage für "wer
sagt was in welchem Panel"-Auswertungen und die automatische
Lesereihenfolge. Zeichne sie mit dem Panel-Werkzeug; ein Doppelklick auf
die Kontur fügt einen weiteren Eckpunkt hinzu, Rechtsklick auf einen Punkt
entfernt ihn wieder.

Für den Panel-für-Panel-Aufbau einer [leeren Seite](#33-eine-leere-seite-anlegen)
bietet die Werkzeugleiste ein **Panel-Raster-Menü** mit gängigen Vorlagen
(1 Panel/ganze Seite, 2/3 übereinander, 2×2, 2×3) — legt mehrere Panels auf
einmal an, jedes schon bereit für [Cut-Panel](#8-panel-inhalte-bearbeiten-cut-panel):
einfach anklicken und die fertige Panel-Grafik zuweisen.

### 6.4 Sperren

Jedes Element lässt sich einzeln sperren (kleines Schloss-Symbol an der
Ecke des ausgewählten Elements) — gesperrte Elemente lassen sich nicht
mehr verschieben/löschen/duplizieren, Text bleibt aber weiterhin
bearbeitbar. Praktisch, um versehentliches Verrutschen zu vermeiden.

Für viele Elemente auf einmal: der **Ebenen-Navigator** (Werkzeugleiste)
listet alles gruppiert nach Panel auf und bietet Sperren/Entsperren für
ganze Gruppen oder die aktuelle Mehrfachauswahl.

### 6.5 Ebenenreihenfolge

Blasen/Bilder/Kurventexte liegen standardmäßig in einer festen
Reihenfolge übereinander — über den Ebenen-Navigator ("In den
Vordergrund"/"In den Hintergrund") oder das Rechtsklick-Menü lässt sich
das für einzelne Elemente ändern, z. B. damit ein Bild-Patch vor statt
hinter einer Blase liegt.

## 7. Japanisches Lettering

Für vertikalen japanischen Text (Tategaki) stellst du bei einer Blase die
**Leserichtung** auf "vertikal" — der Text läuft dann automatisch von oben
nach unten, Spalten von rechts nach links.

### 7.1 Furigana

Kleine Lesehilfe-Zeichen über/neben Kanji: schreibe `{漢字|かんじ}` direkt
in den Text, oder markiere den Text und klicke den Werkzeugleisten-Button
**"Furigana einfügen"** — der fügt die Syntax automatisch ein und schlägt,
falls im [Glossar](#114-glossar) eine passende Lesung hinterlegt ist,
diese gleich vor.

Zwei Varianten:
- **Gruppen-Furigana**: eine Lesung über mehrere Zeichen verteilt, z. B.
  `{大人|おとな}`.
- **Mono-Furigana**: eine eigene Lesung pro einzelnem Zeichen, z. B.
  `{東|とう}{京|きょう}` — mehrere direkt aufeinanderfolgende Blöcke bleiben
  automatisch als ein Wort zusammen, auch über einen Spaltenumbruch hinweg.

### 7.2 Bōten (Betonungspunkte)

Das japanische Äquivalent zu Fett/Kursiv: markiere Text und klicke
**"Bōten einfügen"**, oder schreibe `{最悪*}` direkt in den Text — zeichnet
einen kleinen Punkt neben jedem markierten Zeichen.

### 7.3 Tate-chū-yoko

Zahlen- oder lateinische Buchstabenläufe (z. B. "21") werden in
vertikalem Text automatisch seitlich liegend dargestellt, statt Zeichen
für Zeichen gedreht — das passiert automatisch, keine eigene Syntax nötig.

## 8. Panel-Inhalte bearbeiten (Cut-Panel)

Jedes gezeichnete Panel lässt sich im Panel-Inspector zusätzlich zum
**Cut-Panel** aufwerten (Button "Cut-Panel für „{Sprache}" aktivieren").
Damit kannst du, ganz ohne externes Grafikprogramm:

- **Den Panel-Inhalt verschieben** — z. B. für eine Umgestaltung von
  rechts-nach-links (japanisches Original) auf links-nach-rechts
  (westliche Version), oder um ein leicht verrutschtes Panel zu
  korrigieren.
- **Den Inhalt entfernen** — das Panel verschwindet vollständig aus der
  Vorschau/dem Export, nicht-destruktiv (jederzeit rückgängig zu machen).
- **Den Inhalt durch ein eigenes Bild ersetzen** — z. B. um einen falschen
  Bildinhalt auszutauschen oder eine Zensur-Auflage zu erfüllen.

Wichtig: **nichts davon verändert deine ursprüngliche Scan-Datei** — alles
passiert nur beim Rendern (Vorschau und Export).

### 8.1 Aktivierung: für alle Sprachen oder nur eine

- **"Für alle Sprachen aktivieren"**: sinnvoll, wenn der Panel-Inhalt
  sprachunabhängig ist (z. B. beim Panel-für-Panel-Aufbau einer leeren
  Seite).
- **"Cut-Panel für „{Sprache}" aktivieren"**: betrifft nur die gerade
  aktive Sprache — z. B. ein Schild, das nur in der deutschen/englischen
  Version lokalisiert werden muss, im japanischen Original aber
  unverändert bleiben soll.

### 8.2 Bild-Ersatz im Detail

Bei "Ersetzt durch eigenes Bild" wählst du über denselben Dialog wie beim
Einfügen eines platzierten Bildes eine Datei — pro Sprache einzeln. Ein
**"Passform"**-Umschalter legt fest, ob das Bild gestreckt oder mit
erhaltenem Seitenverhältnis (mit Leerraum an den Kanten) eingepasst wird.
Optional lässt sich ein Rahmen (Farbe + Breite) hinzufügen, der auch im
PNG-Export erscheint.

Zusätzlich kannst du den gezeigten Inhalt **horizontal spiegeln** — pro
Sprache, praktisch um eine Bewegungsrichtung an eine geänderte
Leserichtung anzupassen.

## 9. Automatische Werkzeuge: Auto-Bubbles, Bereinigung, KI

### 9.1 Auto-Bubbles: Sprechblasen automatisch erkennen

Statt jede Blase von Hand zu zeichnen, klicke in der Werkzeugleiste auf
**Auto-Bubbles**. Das Werkzeug läuft komplett in deinem Browser (keine
Daten verlassen ihn) und arbeitet in zwei Schritten:

1. Findet automatisch jede wahrscheinliche Sprechblasen-Fläche auf der
   Seite.
2. Liest den Text innerhalb jeder gefundenen Box automatisch aus.

**Wichtig**: die Texterkennung funktioniert nur für **japanischen**
Quelltext — bei jeder anderen Sprache bleibt der Text leer bzw. sinnlos,
aber die reine Positions-Erkennung (Schritt 1) bleibt trotzdem nützlich.

Danach erscheint ein **Review-Panel**: jede erkannte Region kannst du
einzeln annehmen, den Text korrigieren, oder ablehnen. Erst ein Klick auf
"Übernehmen" fügt die ausgewählten Regionen tatsächlich als echte Blasen
ein — nichts passiert automatisch ohne diese Bestätigung.

Die Modelle laden beim ersten Gebrauch nach (etwas Wartezeit), danach
bleiben sie im Browser zwischengespeichert.

### 9.2 Seite bereinigen (Text aus dem Original entfernen)

Willst du den originalen gedruckten Text aus einer Sprechblase entfernen
und die darunterliegende Zeichnung rekonstruieren (z. B. um Platz für eine
saubere neue Übersetzung zu schaffen), klicke **"Seite bereinigen"** in der
Werkzeugleiste. Ablauf:

1. **Erkennung**: derselbe Detektor wie bei Auto-Bubbles findet
   Textregionen.
2. **Masken-Editor**: die gefundenen Bereiche (rot markiert) erscheinen
   zur Kontrolle. Der Detektor markiert nur den *Text*, oft nicht die
   ganze Blase inklusive Schwänzchen — fünf Werkzeuge lassen dich die
   Maske frei in die gewünschte Form bringen:
   - **Rechteck** — wie bisher aufziehen.
   - **Freihand** — einen beliebigen geschlossenen Umriss nachziehen.
   - **Polygon** — Eckpunkte anklicken, zum Schließen den ersten Punkt
     erneut anklicken.
   - **Pinsel +** / **Pinsel −** — mit einstellbarer Pinselgröße zur
     Maske hinzufügen oder von ihr entfernen, z. B. um eine Region auf
     ein Schwänzchen oder SFX-Schrift zu erweitern, die der Detektor
     nicht erfasst hat, oder eine zu großzügige Erkennung zu stutzen.

   Rückgängig (Button oder Strg/Cmd+Z) geht deine Änderungen schrittweise
   zurück, Leeren setzt auf eine leere Maske zurück. Funktioniert auch,
   wenn die automatische Erkennung nichts gefunden hat — dann markierst
   du komplett von Hand.
3. Klicke **"Weiter"** — der Server rekonstruiert das Bild (das kann je
   nach Anzahl der Bereiche und Server-Hardware eine Weile dauern, von
   Sekunden bis zu mehreren Minuten).
4. **Vorher/Nachher-Vergleich**: prüfe das Ergebnis, klicke
   **"Übernehmen"**, wenn es passt.

**Wichtig**: nichts davon verändert deinen Original-Scan. Das Übernehmen
schaltet nur einen Schalter pro Seite um ("bereinigtes Bild verwenden"),
der sich jederzeit im blauen Hinweisbalken über dem Canvas wieder
rückgängig machen lässt ("Original wiederherstellen").

**Erwartungen zur Qualität**: das Rekonstruktions-Modell ist allgemein
trainiert, nicht speziell auf Manga — auf einfachen, flächigen
Sprechblasen-Hintergründen funktioniert es gut, bei komplexen
handgezeichneten Hintergründen (z. B. hinter großer SFX-Schrift) können
sichtbare Unschärfen/Artefakte auftreten. Der Masken-Editor sorgt dafür,
dass der *richtige Bereich* bearbeitet wird — die Rekonstruktions-Qualität
selbst ist eine Grenze des aktuellen Modells.

### 9.3 KI-Assistent

Öffne über die Werkzeugleiste die Chat-Seitenleiste. Bevor du sie nutzen
kannst, muss unter **"Mein Konto"** mindestens ein KI-Anbieter eingerichtet
sein (eigener API-Key für OpenAI/Anthropic/Google/OpenRouter, eine
"Mit ChatGPT anmelden"-Verbindung über Codex, oder ein selbst gehosteter
Ollama-Server).

Größtenteils beantwortet der Assistent einfach Fragen zur aktuellen Seite
(optional inklusive Seitenbild als Kontext — Checkbox "Aktuelle Seite
einbeziehen"). Zusätzlich versteht er zehn konkrete Anfragen — z. B.
**"Übersetze alle fehlenden deutschen Blasen"**, "Behebe die Blasen mit
Textüberlauf", "Weise diesen Zeilen Charaktere zu", "Style die
Soundeffekt-Blasen", "Prüfe die Lesereihenfolge", "Schlage Glossar-Begriffe
für diese Seite vor", "Korrigiere die Glossar-Verwendung hier" oder
"Schlage eine Übersetzungsnotiz vor" — findet die KI auf der aktuellen
Seite tatsächlich etwas Passendes, antwortet sie mit einem Review-Panel
(pro Zeile annehmbar/bearbeitbar/ablehnbar) statt mit einer Chat-Nachricht.
Aus der Seitenübersicht heraus versteht ein zweites KI-Panel zusätzlich
"Schlage eine Kapiteleinteilung vor" und "Schlage Seitentypen vor" für den
ganzen Band. Wie überall: nichts wird übernommen, bevor du aktiv
bestätigst.

## 10. Mehrsprachig arbeiten

### 10.1 Sprachen verwalten

Über die Sprachleiste im Editor (das "+"-Chip) oder Projekt →
Einstellungen fügst du Sprachen hinzu/entfernst sie. Jede Sprache hat
einen Code (z. B. `de`), eine Anzeigebezeichnung und ein Ordner-Suffix für
den Export.

### 10.2 Sprachspezifische Anpassungen

Fast jedes Text-/Stil-Feld einer Blase (Schriftart, Größe, Ausrichtung,
Leserichtung, Farbe, …) sowie die komplette Form/Position lässt sich per
kleinem Umschalter direkt neben dem Feld **pro Sprache überschreiben** —
z. B. Japanisch vertikal mit einer Schriftart, während Deutsch/Englisch
horizontal bleiben und eine andere Schriftart nutzen. Eine besonders lange
Übersetzung kann so auch eine eigene, größere Blasenform bekommen, ohne
die anderen Sprachen zu beeinflussen.

### 10.3 UI-Sprache vs. Projekt-Sprachen

Nicht verwechseln: die **Oberfläche** (Menüs, Buttons) lässt sich über den
Umschalter oben rechts in sieben Sprachen anzeigen — komplett unabhängig
davon, in welchen Sprachen dein *Projektinhalt* (die Comic-Dialoge selbst)
übersetzt wird.

## 11. Organisation: Charaktere, Story Bible, Glossar, Presets

### 11.1 Charaktere

Über **Projekt → Charaktere** legst du deine Besetzungsliste an: Name,
Farbe, und **Voice Notes** (Freitext zu Sprechweise, Persönlichkeit,
Floskeln — deine "Character Voice Bible"). Weise einer Blase im Inspector
oder per Rechtsklick einen Charakter zu — Umbenennen/Umfärben/Notizen
pflegen wirkt sich dann automatisch überall aus, ohne jede Seite einzeln
anzufassen.

### 11.2 Story Bible

Für umfassenderes Worldbuilding (Orte, Objekte, Fraktionen, nicht nur
Charaktere) gibt es unter **Projekt → Story Bible** einen eigenen
Bereich: freie Einträge mit Typ, Beschreibung, Notizen, Referenzbildern
und Beziehungen zwischen Einträgen (z. B. "ist Schwester von"). Charaktere
aus der Story Bible sind dieselben Datensätze wie unter "Charaktere" —
keine doppelte Pflege nötig.

### 11.3 Lettering-Presets

Wiederverwendbare Stil-Vorlagen (z. B. "SFX Style", "Narration Style") —
verwalte sie über **Projekt → Presets**. Weise sie einer Blase/einem
Kurventext im Inspector zu; änderst du danach das Preset selbst,
aktualisieren sich alle verknüpften Elemente sofort. Ein Preset kann
bewusst nur einzelne Felder definieren (z. B. nur die Schriftart) — der
Rest bleibt Sache der einzelnen Blase.

Eine kleine **Starter-Bibliothek** ("Manga SFX", "Whisper", "Shout") lässt
sich mit einem Klick als Kopie in dein Projekt übernehmen.

### 11.4 Glossar

Über **Projekt → Glossar** pflegst du wichtige, wiederkehrende Begriffe
mit Übersetzung pro Sprache und optionaler Notiz. Sobald ein Begriff eine
Übersetzung für die aktuell aktive Sprache hat, wird jedes Vorkommen
davon **direkt beim Tippen farblich hervorgehoben** — so siehst du sofort,
wo ein bereits abgestimmter Begriff verwendet wurde. Ein Eintrag kann
zusätzlich eine Furigana-Lesung hinterlegen (siehe
[Kapitel 7.1](#71-furigana)).

## 12. Planung: der Skript-Editor

Für die Planungsphase *vor* dem eigentlichen Lettern (Plot, grobe
Panel-Aufteilung, mehrsprachiger Dialogtext) gibt es unter **Projekt →
Skript** einen eigenen Bildschirm — unabhängig vom später gescannten
Seitenbild.

- Lege Skript-Seiten an, darin Panels (mit Kompositions-/Handlungs-Notiz),
  darin Dialogzeilen (Charakter, Regieanweisung, Text pro Sprache).
- Ein **"Kopieren"**-Button pro Dialogzeile legt den Text in die
  Zwischenablage.
- Im Editor selbst gibt es zusätzlich eine **Skript-Sidebar**: verknüpfe
  eine echte Seite mit einer Skript-Seite, dann fügt ein Klick auf
  "In Blase einfügen" den Text direkt in die ausgewählte Blase ein — ganz
  ohne Zwischenablage-Umweg.
- Umgekehrt lässt sich aus bereits geletterten Seiten automatisch ein
  Skript-Gerüst erzeugen (Button "Aus geletterten Seiten generieren") —
  praktisch, wenn du erst später mit der Skript-Planung anfängst.

## 13. Qualitätssicherung und Zusammenarbeit

### 13.1 Reading-Order (Lesereihenfolge)

ComiKumi bestimmt automatisch, in welcher Reihenfolge Blasen gelesen
werden (nach Panel-Position und der eingestellten Leserichtung). Passt das
in einem Einzelfall nicht, korrigierst du es über die Hoch-/
Runter-Buttons in der **Kontextansicht** (Werkzeugleiste) bei der
ausgewählten Blase.

### 13.2 Kontextansicht

Diese Seitenleiste zeigt zur ausgewählten Blase: Sprecher (inkl. Voice
Notes), zugeordnetes Panel, die vorherige/nächste Blase in Lesereihenfolge
(auch über Seitengrenzen hinweg), und einen Bildausschnitt des Panels.
Nützlich beim Übersetzen genauso wie beim reinen Lettern.

### 13.3 Berichte

Über das Menü **"Bericht"** siehst du für die aktuelle Seite: "Wer sagt
was?", dasselbe gruppiert nach Panel, und eine Charakterliste. Ein
**Band-Bericht** aggregiert dasselbe über alle bereits gespeicherten
Seiten des Bandes.

### 13.4 QA-Check

Der QA-Checker (im Band-Bericht-Bereich) prüft automatisch auf:

- **Fehlende Übersetzungen**: eine Blase hat Text in mindestens einer
  Sprache, aber nicht in einer anderen.
- **Doppelte Presets**: zwei Presets mit demselben Namen.
- **Nicht verwendete Glossar-Begriffe**: ein Glossar-Begriff kommt im
  Originaltext vor, seine Übersetzung wurde aber (offenbar) nicht
  verwendet.

Klicke einen Fund an, um direkt zur betroffenen Blase zu springen.

### 13.5 Review-Kommentare

Team-Mitglieder ab der Rolle "Betrachter" können kommentieren, ganz ohne
Bearbeitungsrecht am Layout. Drei Markierungsarten stehen zur Verfügung:

- **Pin** (ein Klick auf eine Stelle),
- **Box** (aufgezogenes Rechteck),
- **Freihand** (ein Kritzel-Strich zum Einkreisen/Unterstreichen).

Jeder Kommentar hat einen Thread mit Antworten und einen
Erledigt-Umschalter. Mit **@Name** oder **@Rolle** (z. B. `@letterer`)
erwähnst du gezielt jemanden — hat die Person eine E-Mail-Adresse
hinterlegt, bekommt sie automatisch eine Benachrichtigung mit Link direkt
zur Stelle.

### 13.6 Read/Review-Oberfläche

Für reines Durchsehen (ohne Bearbeitungswerkzeuge) gibt es einen
eigenen, schlanken **Lese-Screen** — Icon auf jeder Seiten-Karte. Praktisch
für QC-Personen: freies Zoomen, Sprung zu einem bestimmten Panel,
Doppelseitenansicht, bis zu vier Seiten gleichzeitig zum Vergleich
nebeneinander, plus dieselben Kommentar-Werkzeuge wie im Editor.

## 14. Export und Veröffentlichung

Über das **Export**-Menü (Seitenübersicht oder Editor) stehen mehrere
Formate zur Wahl — jeweils mit Auswahl, welche Seiten (aktuelle/alle/
Kapitel/eigener Bereich) und welche Sprache(n) exportiert werden sollen:

- **PNG**: die fertig gerenderte Seite als Bilddatei.
- **Druck-TIFF (CMYK)**: dasselbe Bild, zusätzlich für den Druck
  aufbereitet (CMYK-Farbraum, 300dpi-Metadaten).
- **Vektor-PDF**: druckfähiges PDF mit echtem, scharfem Vektortext statt
  gerasterten Buchstaben.
- **Geschichtetes PSD**: eine Photoshop-Datei mit einer eigenen Ebene pro
  Blase/Bild/Kurventext — praktisch für Nachbearbeitung. Optional (Häkchen
  "Editierbare Text-Ebenen") mit echtem, in Photoshop weiter tippbarem
  Text statt reiner Rastergrafik (funktioniert für einfache, horizontale,
  nicht verschmolzene Blasen).

Im **Export-Viewer** (nach einem Export) lässt sich der Ordner zusätzlich
als **ZIP** oder als **CBZ** herunterladen — CBZ mit einem eigenen Dialog
für ComicInfo.xml-Metadaten (Titel, Mitwirkende, Genre, Altersfreigabe,
Leserichtung, pro-Seite-Infos wie Cover/Doppelseite).

**Seiten-Layout als JSON**: einzelne Seiten oder ein ganzer Band lassen
sich als JSON (bzw. ZIP voller JSONs) exportieren und wieder importieren —
z. B. für ein Backup oder um Layouts zwischen Projekten zu verschieben.

## 15. Konten, Rollen und Mehrbenutzerbetrieb

### 15.1 Rollen

Innerhalb eines Projekts gibt es vier Stufen, jede mit den Rechten der
vorherigen plus mehr:

- **Betrachter**: nur lesen, kommentieren.
- **Übersetzer**: zusätzlich Blasentext und Glossar bearbeiten (keine
  Geometrie-Werkzeuge).
- **Letterer**: volle Bearbeitung — Layout, Panels, Presets, Export,
  Schriften-/Bild-/SVG-Upload.
- **Admin**: zusätzlich Projekteinstellungen und Mitgliederverwaltung
  dieses Projekts.

Ein **Systemadministrator** (serverweites Konto-Flag) hat immer vollen
Zugriff auf jedes Projekt, unabhängig von dessen Mitgliederliste.

### 15.2 Mitglieder verwalten

Über **Projekt → Mitglieder** (sichtbar ab Rolle Admin) fügst du Personen
zum Projekt hinzu und legst ihre Rolle fest. Serverweite Konten selbst
verwaltest du über **Projekt → Konten** (nur für Systemadministratoren).

### 15.3 Gleichzeitiges Arbeiten

Mehrere Personen können gleichzeitig am selben Projekt arbeiten:

- **Konflikterkennung beim Speichern** (siehe [4.4](#44-speichern)) —
  verhindert stilles Überschreiben.
- **Warnung beim Projektwechsel** — war in den letzten fünf Minuten
  jemand anderes aktiv, fragt ComiKumi vor dem Wechsel nach.
- Mehrere **Browser-Tabs** können sogar unterschiedliche Projekte
  gleichzeitig offen haben.

## 16. Einstellungen und Anpassung

### 16.1 Projekteinstellungen

Über **Projekt → Einstellungen**: Beschreibung, Scan-Wurzelordner,
Ordner-Namenskonvention, Leserichtung (bestimmt die automatische
Lesereihenfolge fürs ganze Projekt), optionaler eigener Assets-Ordner
(siehe unten) und Papierkorb-Aufbewahrungsdauer.

### 16.2 Eigene Schriften, Bilder und Blasenkonturen

Unter den jeweiligen Auswahl-Dialogen (Schriftart im Bubble-Inspector,
Bild-Werkzeug, SVG-Blasenkontur) kannst du eigene Dateien hochladen — sie
stehen danach projektweit zur Verfügung. Standardmäßig landen sie in
einer gemeinsamen, gerätweiten Bibliothek; in den Projekteinstellungen
lässt sich zusätzlich ein **eigener Assets-Ordner** je Projekt hinterlegen
(praktisch, wenn du mehrere unabhängige Projekte mit unterschiedlichen
Schriftlizenzen o. Ä. pflegst). Bild- und SVG-Bibliothek lassen sich dabei
in Unterordner gliedern, um bei wachsender Sammlung den Überblick zu
behalten.

### 16.3 UI-Sprache

Umschalter oben rechts in der App-Kopfzeile — betrifft nur die Oberfläche
selbst, siehe [10.3](#103-ui-sprache-vs-projekt-sprachen).

## 17. Tastenkürzel

| Kürzel | Wirkung |
|---|---|
| Strg+Z | Rückgängig |
| Strg+Y / Strg+Umschalt+Z | Wiederholen |
| Strg+D | Auswahl duplizieren |
| Escape | Auswahl aufheben |
| Entf / Rücktaste | Auswahl löschen |
| Pfeiltasten | Auswahl um 1 px verschieben |
| Umschalt + Pfeiltasten | Auswahl um 10 px verschieben |

Tastenkürzel sind deaktiviert, solange ein Textfeld fokussiert ist (damit
z. B. Strg+Z beim Tippen den Text-Editor betrifft, nicht das Layout).

---

*Fehlt dir etwas in diesem Handbuch, oder ist eine Beschreibung unklar?
Sag Bescheid — dieses Dokument wird laufend mit neuen Funktionen
erweitert.*
