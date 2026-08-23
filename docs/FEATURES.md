# Feature-Liste

Vollständige Übersicht aller Funktionen von ComiKumi, Stand aktueller Code. Diese
Datei ist eine Momentaufnahme — bei größeren Änderungen bitte hier mit nachziehen.

## Inhalt

- [Projektverwaltung](#projektverwaltung)
- [Konten, Rollen & Zugriffsschutz](#konten-rollen--zugriffsschutz)
- [UI-Sprache](#ui-sprache)
- [Bände & Seiten](#bände--seiten)
- [Sprachverwaltung](#sprachverwaltung)
- [Charakterverwaltung](#charakterverwaltung)
- [Lettering-Presets](#lettering-presets)
- [Projekt-Assets-Ordner](#projekt-assets-ordner)
- [Editor — Canvas-Grundlagen](#editor--canvas-grundlagen)
- [Elementtypen](#elementtypen)
- [Sperren](#sperren)
- [Cut-Panel](#cut-panel)
- [Text-Liste](#text-liste)
- [Reading-Order](#reading-order)
- [Glossar](#glossar)
- [Kontextansicht](#kontextansicht)
- [Skript-Editor & Skript-Sidebar](#skript-editor--skript-sidebar)
- [Berichte](#berichte)
- [Export & Import](#export--import)
- [Schriftarten](#schriftarten)
- [Undo/Redo](#undoredo)
- [Server-API](#server-api)
- [Fehlerbehandlung & Sicherheit](#fehlerbehandlung--sicherheit)
- [Tests](#tests)

---

## Projektverwaltung

- **Projekt-Umschalter** (Startbildschirm): Liste zuletzt geöffneter Projekte (Name +
  Dateipfad, ein Klick öffnet sie erneut, bis zu 10 Einträge), ein Formular zum Öffnen
  eines Projekts über den Pfad einer `projekt.json`, und ein Button zum Anlegen eines
  neuen Projekts über den **Projekt-Wizard**.
- **Projekt-Wizard**: fünf geführte Schritte statt eines einzelnen Formulars —
  Grundlagen (Name, Speicherort der Projektdatei, Scan-Ordner), Ordner-
  Namenskonvention (Suffixe, Export-Vorlage, vorbelegt mit den Standardwerten),
  initiale Sprachen (frei bearbeitbare Liste, standardmäßig nur mit der aus der
  aktuellen UI-Sprache vermuteten einen Content-Sprache vorbelegt — Mehrsprachigkeit
  bleibt jederzeit über "Hinzufügen" möglich, wird aber niemandem aufgezwungen, der nur
  einsprachig arbeitet) und optional erste Bände. Der Wizard hilft dabei aktiv beim Anlegen der
  nötigen Ordner: fehlt der Scan-Ordner, kann er direkt angelegt werden (inkl. Live-
  Prüfung, ob dort schon Bände gefunden werden); für jeden im letzten Schritt
  angelegten Band entstehen sofort der `<Name><emptySuffix>`-Ordner sowie ein
  `<Name>_<folderSuffix>`-Ordner pro ausgewählter Sprache. Der letzte Schritt zeigt
  eine Zusammenfassung und legt erst dann die eigentliche Projektdatei an.
- **Projekt-Datei**: Jedes Projekt ist genau eine JSON-Datei, die Name, Scan-Wurzel,
  Ordner-Suffixe, Export-Vorlage, Beschreibung, Sprachen und Charaktere bündelt — die
  komplette Projektkonfiguration liegt also portabel in einer Datei statt verteilt in
  Server-internen Daten.
- **Einstellungen-Formular** (Projekt-Menü → Einstellungen, auf allen Bildschirmen):
  Beschreibung (Freitext), Scan-Wurzelordner (mit Live-Prüfung, ob der Ordner vom Server
  aus tatsächlich existiert — rote Warnung falls nicht), Suffix für "leere"
  (unübersetzte) Seitenordner (z. B. `_empty`), Suffix für den Lettering-JSON-Ordner
  (z. B. `_lettering`) und die Export-Ordner-Namensvorlage mit Platzhaltern
  `{book}`/`{folderSuffix}`. Optional außerdem ein
  [Projekt-Assets-Ordner](#projekt-assets-ordner) für projekteigene Schriften/SVG-
  Konturen/Bilder sowie, unabhängig davon, ein eigener Thumbnail-Ordner. Zusätzlich die
  **Leserichtung** (rechts→links/Japanisch-Manga, Standard, oder links→rechts/westlich)
  — bestimmt die automatische [Reading-Order](#reading-order) von Panels und Blasen für
  das ganze Projekt; bestehende Projekte ohne dieses Feld bleiben unverändert bei
  rechts→links, der bisherigen impliziten Annahme.
- **Eingebauter Datei-/Ordner-Browser**: Da ein normales `<input type="file">` keinen
  absoluten Pfad liefert, bringt das Tool einen eigenen, servergestützten
  Dateisystem-Browser mit — listet Laufwerke (Windows) als Wurzeln, erlaubt Navigation
  rauf/runter, und wählt entweder einen Ordner ("Diesen Ordner wählen") oder direkt eine
  `.json`-Datei aus. Wird für die Scan-Wurzel-Auswahl und zum Öffnen/Anlegen von
  Projektdateien verwendet.
- **Band-Erkennung**: Der Server durchsucht die Scan-Wurzel rekursiv (bis Tiefe 5) nach
  Ordnern, die auf das konfigurierte "Leer"-Suffix enden (z. B. `*_empty`), behandelt
  jeden als einen "Band", und ermittelt, welche Sprachordner daneben schon existieren.
- **Migration alter Projekte**: Einmalig und automatisch werden alte
  Einzelprojekt-Dateien (`settings.json`/`languages.json` aus Vorgängerversionen) beim
  ersten Start in eine echte Projektdatei überführt, ohne die Originale anzufassen.

## Konten, Rollen & Zugriffsschutz

- **Server-weite Konten**: Benutzername + Passwort (Passwörter serverseitig per
  `scrypt` gehasht, kein Klartext, keine native Abhängigkeit). Beim allerersten Start
  (noch keine Konten vorhanden) zeigt die App statt eines Logins einen
  Ersteinrichtungs-Bildschirm — das dort angelegte Konto wird automatisch
  Systemadministrator.
- **Anmeldung**: JWT-Bearer-Token (`Authorization`-Header), im Browser in
  `localStorage` gespeichert, 30 Tage gültig. Funktioniert unverändert, wenn Client
  und Server auf getrennten Origins laufen (siehe die konfigurierbare API-Basis-URL).
- **Projektbezogene Rollen**: Betrachter (nur lesen) < Übersetzer (Blasentext +
  Glossar) < Letterer (volle Bearbeitung: Layout, Panels, Presets, Export,
  Schriften-/Bild-/SVG-Upload) < Admin (zusätzlich Projekteinstellungen und
  Mitgliederverwaltung dieses Projekts). Die Mitgliederliste eines Projekts lebt
  portabel in dessen eigener Projektdatei (wie Charaktere/Glossar/Presets) — zieht
  also mit um, wenn die Datei kopiert/verschoben wird.
- **Systemadministrator** (serverweites Konto-Flag, unabhängig von einzelnen
  Projekten): voller Bypass-Zugriff auf jedes Projekt unabhängig von dessen
  Mitgliederliste, plus alleiniger Zugriff auf Projekt-Umschalter-Aktionen (Projekt
  anlegen/löschen/archivieren, Dateisystem durchsuchen) und die serverweite
  Kontenverwaltung.
- **Übersetzer-Einschränkung**: Da es (noch) keinen eigenen "nur Text"-Endpunkt gibt,
  teilen sich Übersetzer und Letterer denselben Speichern-Endpunkt für das
  Seiten-Layout — der Server vergleicht bei der Rolle "Übersetzer" das eingehende
  Layout gegen die zuletzt gespeicherte Version und lehnt jede Änderung außerhalb der
  Blasentext-Felder ab. Im Editor selbst bleiben für Übersetzer nur die Textfelder
  aktiv, keine Geometrie-Werkzeuge.
- **Mitglieder-/Kontenverwaltung**: über das "Projekt"-Menü — "Mitglieder" (Rolle
  dieses Projekts, ab Admin sichtbar) und "Konten" (serverweite Konten, nur für
  Systemadministratoren sichtbar).

## UI-Sprache

- Die **Oberfläche selbst** (Labels, Buttons, Menüs, Tooltips, Bestätigungsdialoge,
  Fehlermeldungen) ist in sieben Sprachen verfügbar: Englisch, Deutsch, Japanisch,
  Französisch, Spanisch, Chinesisch (vereinfacht) und Koreanisch — umsetzt über
  `react-i18next` (`client/src/i18n/`).
- **Wichtige Abgrenzung**: Das ist komplett unabhängig von der
  [Sprachverwaltung](#sprachverwaltung) weiter oben — jene verwaltet die
  Content-Sprachen eines *Projekts* (in welchen Sprachen die Comic-Dialoge selbst
  übersetzt werden). Ein Nutzer kann die UI z. B. auf Englisch stellen und trotzdem
  Deutsch/Japanisch als Übersetzungssprachen im Projekt pflegen.
- **Umschalter** in der App-Kopfzeile (neben "Einstellungen"), zeigt jede Sprache in
  ihrer eigenen Bezeichnung (z. B. "日本語", "한국어"). Wechsel übersetzt die aktuell
  sichtbare Seite sofort, ohne Neuladen.
- **Standardsprache**: Beim allerersten Start wird die Browser-/System-Sprache erkannt;
  passt keine der sieben, ist Englisch der Fallback. Die getroffene Wahl wird
  client-seitig in `localStorage` gespeichert (Schlüssel `comikumi.uiLocale`) — eine
  reine Maschinen-/Browser-Einstellung, kein Teil der Projektdatei.
- **Server-Fehlercodes**: API-Fehlerantworten sind stabile `snake_case`-Codes
  (`{ error, params? }`) statt roher Prosa — der Client übersetzt sie über den
  `errors.*`-Namensraum (`client/src/api/client.ts`s `ApiError` +
  `client/src/i18n/translateApiError.ts`).
- **Übersetzungsqualität**: Alle sieben Sprachversionen wurden direkt erstellt (kein
  externer Übersetzungsdienst) — fachlich sauber, aber ohne Muttersprachler-Review. Für
  den internen Gebrauch ausreichend; bei einer öffentlichen Veröffentlichung wäre ein
  Korrekturdurchgang durch Muttersprachler empfehlenswert.

## Bände & Seiten

- **Band-Liste**: Jeder erkannte Band als Karte (Ordnername, bereits vorhandene
  Sprachen), führt zur Seiten-Übersicht. Ohne gefundene `*_empty`-Ordner erklärt der
  Bildschirm warum und verweist auf Projekt → Einstellungen.
- **Seiten-Übersicht**: Vorschaubild-Raster aller Seiten eines Bandes (verzögert
  geladen, serverseitig als JPEG zwischengespeichert und automatisch neu erzeugt, wenn
  sich die Quelldatei ändert), ein Klick öffnet den Editor für diese Seite. Zeigt einen
  Seitenzähler in der Statusleiste. Der Cache liegt in einem separat konfigurierbaren
  [Thumbnail-Ordner](#projekt-assets-ordner), standardmäßig direkt neben der Projektdatei.
- **Seiten hochladen**: Über "Seite → Seiten hochladen…" lassen sich ein oder mehrere
  Seiten-Scans direkt aus dem Browser in den `_empty`-Ordner des Bandes hochladen —
  wichtig, sobald Client und Server auf getrennten Geräten laufen (bisher ließ sich
  eine neue Seite nur hinzufügen, indem die Bilddatei direkt ins `scanRoot` auf der
  Server-Maschine kopiert wurde). Existiert bereits eine Seite mit demselben
  Dateinamen, fragt ein Dialog vor dem Überschreiben nach. Jede Seiten-Karte hat
  zusätzlich einen "Löschen"-Button — entfernt nur die Quelldatei (eine für diese
  Seite bereits gespeicherte Lettering-Datei bleibt in jedem Fall bestehen) und **nicht
  destruktiv**: die Datei landet in einem `_trash`-Ordner direkt neben `scanRoot` (mit
  Zeitstempel im Dateinamen und derselben relativen Ordnerstruktur wie im Original), statt
  sofort endgültig gelöscht zu werden. Eine Systemverwaltung kann eine Datei jederzeit
  manuell wiederherstellen, indem sie sie zurück an ihren ursprünglichen Ort verschiebt
  und den Zeitstempel-Präfix entfernt. Ein automatischer Hintergrund-Sweep (alle 6
  Stunden, `server/src/index.ts`) räumt den Papierkorb danach selbstständig auf — wie
  lange eine Datei dort verbleibt, bevor sie endgültig entfernt wird, ist über
  Einstellungen → "Papierkorb-Aufbewahrung (Tage)" konfigurierbar (Default: 30 Tage).
- **Leere Seite anlegen**: über "Seite → Leere Seite…" lässt sich statt eines Uploads
  auch eine komplett leere (weiße) Seite in gewählter Größe anlegen — für Seiten, die
  nicht aus einem Gesamt-Scan entstehen, sondern Panel für Panel aus bereits fertig
  gezeichneten Einzelgrafiken zusammengesetzt werden sollen (siehe
  [Panel-Inhalt ersetzen](#cut-panel) und die Panel-Raster-Vorlagen im Editor-Werkzeug).
  Nutzt denselben Upload-Weg wie oben, verhält sich danach wie jede andere Seite und
  öffnet sich direkt im Editor.
- Beide Bildschirme haben ein **"Projekt"-Menü** (Projekt wechseln, Charaktere
  verwalten, Einstellungen öffnen) sowie eine Menüleiste mit Import-/Export-Aktionen
  (siehe [Export & Import](#export--import)), einen Eintrag "Bericht für den Band" und
  eine Status-/Meldungsleiste für Hintergrundvorgänge.

## Sprachverwaltung

- **Sprachen** sind projektweit definiert: ein Code (z. B. `de`), eine Anzeige-
  Bezeichnung (z. B. "Deutsch") und ein Ordner-Suffix für die Export-Konvention (z. B.
  `volume_01_german`).
- **Sprachen-Verwaltung** (Popover, sowohl kompakt in der Sprachleiste als auch als
  vollständiges Formular): Sprache hinzufügen (Ordner-Suffix wird automatisch aus der
  Bezeichnung abgeleitet, kann aber manuell überschrieben werden), Sprache löschen (mit
  Sicherheitsabfrage — bereits übersetzte Texte bleiben in der JSON erhalten, verlieren
  nur ihren Tab). Der Server lehnt doppelte Codes/Ordner-Suffixe mit einem Fehler ab.
- **Sprachleiste**: Der vertikale Sprach-Umschalter neben der (einklappbaren)
  Text-Seitenleiste im Editor — ein Klick auf einen Tab (`DE`, `EN`, `JP`, …) wechselt,
  welche Sprache der Inspector gerade bearbeitet; das "+"-Chip öffnet die kompakte
  Sprachen-Verwaltung direkt darin.
- **Sprachspezifische Anpassungen**: Praktisch jedes Textformatierungs-Feld einer
  Blase/eines Kurventexts (Schriftart, Größe, Zeilenhöhe, Ausrichtung, Leserichtung,
  Umrandung, Farbverlauf) sowie die komplette visuelle Form (Position/Größe/Rotation/
  Hintergrund) kann per Umschalter ("Alle" vs. aktive Sprache) direkt neben dem
  jeweiligen Feld sprachspezifisch überschrieben werden — z. B. Japanisch vertikal mit
  einer Schriftart, während Deutsch/Englisch horizontal bleiben und eine andere
  Schriftart nutzen; eine Übersetzung mit mehr Platzbedarf kann eine eigene, verschobene
  Blasenform bekommen.

## Charakterverwaltung

- **Charaktere** sind eine projektweite Besetzungsliste: ID, Name, eine Farbe und
  **Voice Notes** (freier Text: Sprechweise, Persönlichkeit, Floskeln, Förmlichkeit —
  die "Character Voice Bible"). Referenziert wird per `characterId` auf der Blase
  (nicht in der Seite dupliziert) — Umbenennen, Umfärben oder Nachpflegen der Voice
  Notes muss also keine einzige Seite anfassen.
- **Charakter-Verwaltung** (Modal, über das "Projekt"-Menü auf jedem Bildschirm
  erreichbar): Charakter anlegen (Name, Farbwähler, Voice Notes), per Klick auf einen
  Eintrag bearbeiten, löschen (mit Warnung, dass Blasen mit dieser Zuordnung nur die
  Zuordnung verlieren, nicht gelöscht werden).
- **Zuordnung**: pro Blase über ein Dropdown im Bubble-Inspector oder über das
  Rechtsklick-Kontextmenü im Canvas ("Charakter zuweisen"-Untermenü). Fließt direkt in
  die [Berichte](#berichte) und die [Kontextansicht](#kontextansicht)
  ein — die Voice Notes werden dort und unter dem Charakter-Dropdown im Bubble-Inspector
  angezeigt, sobald einer Blase ein Charakter mit Notizen zugeordnet ist.

## Lettering-Presets

Projektweite, live verknüpfte Stil-Vorlagen (z. B. "Bubble Style", "Character Style",
"Narration Style", "SFX Style") für Textstil und Blasenhintergrund — verwaltet über ein
Modal im "Projekt"-Menü auf jedem Bildschirm (Anlegen, Bearbeiten per Klick auf einen
Eintrag, Löschen). Anwendbar auf Blasen **und** Kurventexte (Kurventexte nutzen nur den
Textstil-Teil, keinen Blasenhintergrund).

- **Sparse/granular pro Feld**: Ein Preset kann bewusst nur einen Teil der ~17 Felder
  definieren (z. B. nur die Schriftart) — jedes Feld ist einzeln per Checkbox ein-/
  ausschaltbar. Nicht definierte Felder bleiben vollständig Sache der einzelnen
  Blase/des Kurventexts und werden vom Preset nie angefasst. So kann z. B. die
  Schriftart aller SFX-Blasen auf einmal geändert werden, ohne individuell eingestellte
  Schriftgrößen zu überschreiben.
- **Live-Verknüpfung**: Eine Blase/ein Kurventext trägt eine `presetId`. Ändert man ein
  vom Preset definiertes Feld im Preset selbst, aktualisieren sich alle verknüpften
  Elemente sofort — ohne Neuladen, in Live-Vorschau **und** PNG-Export gleichermaßen.
  Ein gelöschtes Preset wird wie ein gelöschtes Panel/ein gelöschter Charakter
  behandelt: die Verknüpfung fällt automatisch auf den eigenen Basiswert der Blase
  zurück.
- **Rangfolge** (am spezifischsten gewinnt): Sprach-Override > Preset-definiertes Feld
  > Blasen-/Kurventext-eigener Basiswert. Ein `formOverride` (komplettes
  Sprach-Override der gesamten Blasenform) gewinnt weiterhin immer, unabhängig von
  Presets.
- **Umfang**: Textstil (Schriftart, Größe, Zeilenhöhe, Ausrichtung, Leserichtung, Farbe,
  Umrandung, Farbverlauf) und, nur für Blasen, Blasenhintergrund (Blasenstil, Füll-/
  Randfarbe, Randbreite, Zeigerart inkl. Ketten-Details). Reine Geometrie
  (Position/Größe/Rotation, Tail-Spitze/-Anker/-Breite/-Krümmung) ist bewusst kein
  Preset-Feld — das sind Instanz-Eigenschaften einer einzelnen Blase, kein "Stil".
- **Zuordnung**: über ein Preset-Dropdown im Bubble-/Kurventext-Inspector, oder über das
  Rechtsklick-Kontextmenü im Canvas ("Preset zuweisen"-Untermenü, nur für Blasen). Jedes
  vom aktuellen Preset gesteuerte Feld wird im Inspector deaktiviert angezeigt (mit
  Hinweis, von welchem Preset es vorgegeben wird) — außer ein Sprach-Override dafür ist
  aktiv, der gewinnt immer. Ein "Vom Preset lösen"-Button friert alle aktuell vom
  Preset übernommenen Werte einmalig in die Blase/den Kurventext ein und entfernt die
  Verknüpfung, ohne dass sich optisch etwas ändert.

## Editor — Canvas-Grundlagen

- **Zoom & Pan**: Mausrad zoomt zum Cursor hin (20 %–600 %), Ziehen auf leerer Fläche
  verschiebt die Ansicht, +/- -Buttons und "Reset" in der Statusleiste, laufende
  Prozentanzeige.
- **Automatische Einpassung**: Das Seitenbild wird auf die verfügbare Fläche skaliert
  (per ResizeObserver verfolgt), sodass hohe Seiten in der Höhe passen und die Seite nie
  einen Scrollbalken erzwingt.
- **Auswahl**: Klick auf Blase/Bild/Kurventext/Panel wählt es aus; Shift-Klick fügt es
  einer Mehrfachauswahl hinzu/entfernt es daraus. Klick auf leere Fläche hebt die
  Auswahl auf. Ein Wechsel auf einen anderen Element-*Typ* bei gehaltener Shift-Taste
  startet immer eine neue, typreine Auswahl — gemischte Mehrfachauswahl über Typen
  hinweg wird bewusst nicht unterstützt.
- **Verschieben/Skalieren/Rotieren**: Jeder Elementtyp hat eigene Ziehgriffe
  (Rechteck-/Oval-Blasen rotieren/skalieren um ihr Zentrum passend zur
  PNG-Export-Mathematik; Viereck-Blasen und Bilder ziehen einzelne Eckpunkte für
  freie perspektivische Verzerrung).
- **Tastaturkürzel** (global, deaktiviert während ein Textfeld fokussiert ist):
  Strg+Z Rückgängig, Strg+Y / Strg+Umschalt+Z Wiederholen, Strg+D Duplizieren,
  Escape Auswahl aufheben, Entf/Rücktaste Auswahl löschen, Pfeiltasten verschieben
  die Auswahl um 1 px (10 px mit gehaltener Umschalttaste).
- **Zeichenwerkzeuge**: Ein aktiviertes Werkzeug (Oval-/Rechteck-/Viereck-Blase oder
  "Panel") verwandelt Ziehen auf dem Canvas in eine Vorschau-Box, die ab einer
  Mindestgröße (>5 px) als neues Element dieser Größe/Art entsteht.
- **Rechtsklick-Kontextmenü**: Erscheint an der Klickposition (bildschirmfest,
  unabhängig von Zoom/Pan), bleibt automatisch im sichtbaren Bereich, schließt bei Klick
  außerhalb oder Escape. Auf einer Blase: Untermenüs "Panel zuweisen" und "Charakter
  zuweisen" (live aus dem aktuellen Layout aufgebaut, aktuelle Zuordnung markiert),
  sowie Duplizieren/Löschen. Auf einem Panel (Fläche, nicht Eckpunkt): Duplizieren/
  Löschen; auf einem einzelnen Panel-Eckpunkt oder einer Viereck-Blasen-Ecke
  zusätzlich "Winkel setzen" (zwei Varianten — vorherigen bzw. nächsten Punkt
  fixieren, mit Eingabefeld für den exakten Winkel in Grad; der jeweils nicht
  fixierte Nachbarpunkt dreht sich um den angeklickten Punkt, bis genau dieser Winkel
  anliegt, Kantenlänge bleibt erhalten), auf einem Panel-Eckpunkt außerdem "Punkt entfernen" (deaktiviert
  bei nur noch 3 Punkten). Untermenüs klappen inline auf (kein Hover-Flyout).

## Elementtypen

### Sprechblasen

Drei Formen — Rechteck, Oval und ein freies "Viereck" (Perspektive), dessen vier
Eckpunkte unabhängig gezogen werden können; der Text wird dabei mit einer echten
projektiven Transformation verzerrt (z. B. für ein schräg gesehenes Schild).

Blasen-Hintergrundstile: keine (unsichtbare Überlagerung auf vorhandener Grafik),
Sprechblase, Gedankenblase, Effekt (gezackter Rand), oder eine eigene hochgeladene
SVG-Kontur. Bei sichtbarem Stil: Füll-/Randfarbe, Randbreite, und ein optionaler
Zeiger/Schwanz mit eigenem Stil — nahtlos verbunden, freistehend, oder eine
segmentierte "Kette" (Kreis/Rechteck/Raute-Segmente, Anzahl und Abstand konfigurierbar)
— Position, Breite und Krümmung sind alle per Canvas-Ziehgriff einstellbar.

Text-Optionen: Schriftart (eigene hochgeladene Schriften), Größe, Zeilenhöhe,
horizontale Ausrichtung, sowie Leserichtung — horizontal LTR, horizontal RTL, oder
vertikal (Tategaki) inklusive Furigana (`{漢字|かんじ}`) und automatischem
Tate-chū-yoko (seitlich liegende Zahlen-/Lateinlauf-Blöcke). Text kann eine
Umrandung und/oder einen linearen Farbverlauf statt Volltonfarbe bekommen. Jedes
dieser Stil-Felder (und die komplette Form/Position/Größe/Rotation/Hintergrund) ist
per Sprach-Umschalter überschreibbar. Blasen können einem Panel und einem Charakter
zugeordnet werden.

### Bilder

Ein platziertes Rasterbild, in ein freies Viereck verzerrt (gleicher
Eckpunkt-Zieh-Mechanismus wie Viereck-Blasen) — für Dinge, die Text nicht abdecken
kann, z. B. ein neu gezeichnetes/übersetztes Schild oder Poster. Die eigentliche
Bilddatei kann pro Sprache unterschiedlich sein (aus einer gemeinsamen Bild-Bibliothek
hochgeladen), mit Deckkraft-Regler; eine Sprache ohne eigene Datei fällt automatisch
auf eine andere zugewiesene zurück, damit das Element nie leer bleibt.

### Kurventext

Ein freistehender Titel-/Effekttext (z. B. ein logoartiger Kapiteltitel oder eine
Lautmalerei wie "BOOM!"), der entlang einer kubischen Bézierkurve mit 4 ziehbaren
Kontrollpunkten verläuft, statt in einer Blasen-Box zu sitzen. Bewusst einzeilig/ohne
Leserichtungs-Option (ein fokussiertes Titel-/Effekt-Werkzeug, kein zweites
Volltext-Layoutsystem) — Schriftart, Größe (schrumpft automatisch passend zur Kurve),
Ausrichtung entlang der Kurve (Anfang/Mitte/Ende), Farbe/Umrandung/Farbverlauf, alle
mit demselben Sprach-Umschalter-Muster.

### Panels

Ein manuell gezeichnetes Referenzpolygon, das einen Comic-Panel markiert — reine
Editor-Anmerkung mit Beschriftung (automatisch "Panel N" falls leer gelassen) und
Rahmenfarbe. Startet beim Zeichnen als Rechteck, ist danach aber ein frei formbares
Polygon (nicht auf 4 rechte Winkel beschränkt, passend zu schräg geschnittenen oder
mehreckigen Manga-Panels): die ganze Fläche ziehen verschiebt sie, ein einzelner
Eckpunkt verformt sie, Doppelklick auf die Kontur fügt dort einen neuen Punkt ein,
Rechtsklick auf einen Punkt entfernt ihn (mindestens 3 Punkte bleiben immer erhalten).
Blasen können einem Panel manuell zugeordnet werden, um "wer sagt was pro
Panel"-Auswertungen zu ermöglichen. **Erscheint nie im PNG-Export.**

Neben dem einzelnen Panel-Werkzeug bietet die Werkzeugleiste ein **Panel-Raster-Menü**
mit gängigen Vorlagen (1 Panel/ganze Seite, 2/3 übereinander, 2×2, 2×3) — legt auf einen
Klick mehrere Panels gleichmäßig verteilt an, jedes bereits im Zustand
[„Ersetzt durch eigenes Bild"](#cut-panel) (für alle Sprachen aktiviert): einfach
anklicken und die fertige Panel-Grafik zuweisen. Gedacht für den
Panel-für-Panel-Aufbau einer [leeren Seite](#bände--seiten).

## Sperren

Jedes Element (Blase, Panel, Bild, Kurventext) lässt sich einzeln gegen versehentliches
Verschieben, Verformen, Löschen und Duplizieren sperren. Ein ausgewähltes Element zeigt
ein kleines Schloss-Symbol an seiner Ecke — offen bedeutet entsperrt, geschlossen
gesperrt; ein Klick darauf schaltet um. Solange ein Element gesperrt ist:

- Ziehen, Größenänderung, Rotation und Konturpunkte lassen sich nicht mehr bewegen.
- Entf-Taste und Duplizieren (Strg+D) wirken nicht — auch nicht über das
  Rechtsklick-Menü. Ist das Element Teil einer Mehrfachauswahl, werden nur die
  ungesperrten Elemente betroffen, das gesperrte bleibt unangetastet (und ausgewählt)
  liegen.
- Text-/Stil-Bearbeitung im Inspector bleibt weiterhin möglich — die Sperre betrifft
  ausschließlich Geometrie.

Ein gesperrtes Panel schützt nur sich selbst, nicht automatisch seine zugeordneten
Kind-Blasen (siehe [Elementtypen](#elementtypen) → Panels) — die bleiben unabhängig
sperr-/bearbeitbar. Die Sperre wird im gespeicherten Layout nur dann mit abgelegt, wenn
das Element zuletzt gesperrt war (siehe `locked` in
[JSON-Format.md](JSON-Format.md#bubble)).

## Cut-Panel

Keine eigene Werkzeugleisten-Schaltfläche und kein eigener Datentyp — jedes [Panel](#elementtypen)
lässt sich im Panel-Inspector per Knopf „Cut-Panel für „{Sprache}" aktivieren" zusätzlich
zum Cut-Panel aufwerten: sein Inhalt wird dadurch visuell von der Original-Seite
(`_empty`-Quelldatei) gelöst und lässt sich danach frei verschieben. Typische
Anwendungsfälle: ein Panel für eine RTL→LTR-Umgestaltung an eine andere Stelle der Seite
bringen, oder ein leicht verrutschtes Panel korrigieren — ganz ohne externes
Grafikprogramm.

**Aktivierung** gibt es in zwei Varianten:
- **„Für alle Sprachen aktivieren"** — löst den Panel-Inhalt einmalig für jede Sprache
  gleichzeitig (schreibt in die Basis-Felder des Panels). Die richtige Wahl, wenn der
  Panel-Inhalt sprachunabhängig ist — allen voran beim [Panel-für-Panel-Aufbau einer
  leeren Seite](#bände--seiten) aus fertigen Einzelgrafiken: einmal ein Bild zuweisen,
  sichtbar in jeder Projektsprache, ohne erneuten Upload.
- **„Cut-Panel für „{Sprache}" aktivieren"** — betrifft ausschließlich die gerade aktive
  Sprache; alle anderen bleiben unverändert ein normales, unbearbeitetes Panel. Gedacht
  für gezielte Ausnahmen (z. B. ein Schild, das nur in „de"/„en" lokalisiert werden muss,
  im japanischen Original aber unverändert bleibt). Ein „...deaktivieren"-Knopf (erscheint,
  sobald für die aktive Sprache Cut-Verhalten aktiv ist) macht das gezielt für genau diese
  eine Sprache wieder rückgängig (siehe [Sprachabhängiges Verhalten](#sprachabhängiges-verhalten)
  unten).

Verhalten (ansonsten identisch zu einem normalen Panel — Beschriftung, Rahmenfarbe,
Kind-Blasen-Zuordnung, Sperren, Duplizieren, Löschen funktionieren gleich):

- **Die ganze Fläche verschieben** trägt den losgelösten Inhalt mit an die neue Position.
  Die verlassene Original-Stelle wird mit einer Fläche überdeckt — die Füllfarbe wird
  beim Aufwerten zunächst von der Panel-Randfarbe übernommen und ist im Panel-Inspector
  jederzeit manuell änderbar. Das ist **nicht destruktiv**: die `_empty`-Quelldatei
  selbst bleibt unverändert, die Überdeckung passiert nur beim Rendern (Vorschau wie
  PNG-Export).
- **Einen einzelnen Eckpunkt verformen** korrigiert die Kontur, ohne das Panel zu
  verschieben — der angezeigte Ausschnitt aus der Originalseite passt sich dabei
  automatisch an die neue Form an.
- Ein noch nie verschobenes Cut-Panel sieht optisch identisch zu einem unbearbeiteten
  Panel-Bereich aus (die Loch-Füllung und der Ausschnitt decken sich exakt).

### Drei Inhalts-Zustände eines Cut-Panels

Im Panel-Inspector legt eine einzige Auswahl „Inhalt" fest, was an der aktuellen
Panel-Position gezeigt wird — die drei Optionen schließen sich gegenseitig aus:

- **„Original-Ausschnitt"** (Standard) — der Inhalt, wie unter „Cut-Panel" oben
  beschrieben (verschieben, umformen).
- **„Entfernt (nicht-destruktiv)"** — die Original-Stelle wird nur überdeckt, der Inhalt
  aber **nirgends** erneut gezeichnet: das Panel verschwindet visuell vollständig, in
  Vorschau und PNG-Export gleichermaßen. Rein visuell/semantisch und jederzeit durch
  Zurückstellen auf „Original-Ausschnitt" rückgängig zu machen — Geometrie und
  zugeordnete Kind-Blasen bleiben vollständig unangetastet. Ein so entferntes Panel gilt
  aber semantisch als nicht mehr vorhanden für Skript, Berichte und Leserichtung
  (`groupBubblesByPanel()` in `reportUtils.ts`) — eine ihm zugeordnete Blase erscheint
  stattdessen in der „Ohne Panel"-Gruppe. Im Panel-Zuordnungs-Dropdown/-Kontextmenü
  bleibt das Panel weiterhin mit dem Zusatz „(entfernt)" sichtbar.
- **„Ersetzt durch eigenes Bild"** — siehe nächster Abschnitt.

Unabhängig davon bleibt der bestehende **„Panel löschen"-Button**: er entfernt den
Panel-Datensatz endgültig aus der Seite und entkoppelt seine Kind-Blasen (zurück auf
absolute Koordinaten) — nicht rückgängig zu machen außer per Undo. Die „Inhalt"-Auswahl
betrifft dagegen nie den Datensatz selbst, nur was gerendert wird.

### Panel-Inhalt ersetzen

Statt den Original-Ausschnitt zu verschieben oder zu entfernen, lässt er sich auch durch
ein **eigenes hochgeladenes Bild** ersetzen — z. B. um einen falschen Bildinhalt
auszutauschen oder eine Zensur-Auflage zu erfüllen, ohne die ganze Seite neu erstellen zu
müssen. Im Panel-Inspector unter „Inhalt" → „Ersetzt durch eigenes Bild" auswählen, dann
über denselben Bild-Auswahl-Dialog wie beim Einfügen eines platzierten Bildes ein Bild
hochladen oder aus der Bibliothek wählen — pro Sprache einzeln (wie bei platzierten
Bildern: fehlt für die aktive Sprache ein eigenes Bild, wird ersatzweise irgendeine andere
zugewiesene Sprache gezeigt, statt leer zu bleiben).

Das Ersatzbild wird auf die Bounding-Box des aktuellen Panel-Polygons gestreckt und auf
dessen tatsächliche Form geclippt (keine Seitenverhältnis-Erhaltung, keine echte
4-Punkt-Perspektivverzerrung wie bei platzierten Bildern/Viereck-Blasen — ein
Panel-Polygon kann beliebig viele Eckpunkte haben, nicht zwingend 4). Optional lässt sich
zusätzlich ein Rahmen (Farbe + Breite) um das Ersatzbild legen — anders als die
Panel-Randfarbe (reine Editor-Kontur, nie im Export) wird dieser Rahmen tatsächlich mit
in den PNG-Export gezeichnet.

### Sprachabhängiges Verhalten

Ob ein Panel überhaupt ein Cut-Panel ist, ist selbst ein **Schalter pro Sprache** — nicht
nur seine Details. Der „Cut-Panel für „{Sprache}" aktivieren/deaktivieren"-Knopf im
Panel-Inspector betrifft ausschließlich die gerade aktive Sprache; Position/Form,
„Inhalt"-Zustand, Loch-Füllung und Ersatzbild/Rahmen lassen sich danach zusätzlich **pro
Sprache** unterschiedlich einstellen, über das Häkchen „Eigene Version für „{Sprache}""
(nur relevant, sobald Cut-Verhalten für diese Sprache aktiv ist). Damit ist dasselbe
Panel gleichzeitig eine unveränderte Referenzmarkierung in einer Sprache und ein voll
bearbeitetes Cut-Panel in einer anderen — **eine einzige Entity** deckt beide Rollen ab,
es gibt keinen separaten Panel-Typ.

Beispiel: ein Panel bleibt in „ja" (Original) unverändert an Ort und Stelle — reine
semantische Markierung, keine sichtbare Wirkung, kein aktiviertes Cut-Verhalten. In
„de"/„en" wurde es dagegen gezielt aktiviert und ist dort verschoben, entfernt oder
durch ein eigenes Bild ersetzt (z. B. für eine RTL→LTR-Umgestaltung oder eine
Zensur-Auflage im Zielmarkt).

- Ohne Aktivierung für eine Sprache verhält sich das Panel dort wie ein ganz normales,
  unbearbeitetes Panel — unabhängig davon, ob/wie es für andere Sprachen aktiviert ist.
  Ältere, noch sprachunabhängige Cut-Panels aus früheren Arbeitsständen bleiben davon
  unberührt: sie gelten weiterhin einfach für jede Sprache gleich, bis gezielt eine
  Sprache abweichend aktiviert/deaktiviert wird.
- Aktivieren/Deaktivieren übernimmt beim Umschalten die aktuell angezeigte Geometrie 1:1
  (kein optischer Sprung) und legt dafür automatisch einen Sprach-Override an; das
  Häkchen „Eigene Version" zeigt diesen Zustand an und erlaubt einen vollständigen Reset
  auf die Basis.
- **Kind-Blasen sind davon unberührt**: ihre Position bleibt immer relativ zum
  **Basis**-Anker des Panels, unabhängig davon, ob und wie das Panel für die gerade
  aktive Sprache verschoben ist. Wer eine Blase pro Sprache anders platzieren möchte,
  tut das weiterhin unabhängig über die Blase selbst (Sprach-Override der Bubble-Form).
- Ein in einer Sprache „entferntes" Panel (siehe oben) gilt auch nur in **dieser**
  Sprache als semantisch nicht vorhanden für Skript/Berichte/Leserichtung — in jeder
  anderen Sprache ohne diesen Override erscheint es dort ganz normal.
- Sperren (`locked`) gilt bewusst **immer sprachübergreifend** — eine Sperre soll
  unabhängig davon halten, welche Sprache gerade aktiv ist.

## Text-Liste

Einklappbare Seitenleiste mit jeder Blase/jedem Kurventext der aktuellen Seite in
Leserichtung (oben nach unten), mehrzeiliger Text zu einer Zeile zusammengefasst
(Zeilenumbrüche als "⏎" angezeigt). Hat eine eigene, von der aktiven Bearbeitungssprache
unabhängige Sprachauswahl, damit z. B. der japanische Ausgangstext mitgelesen werden
kann, während anderswo die deutsche Übersetzung bearbeitet wird. Klick auf einen
Eintrag wählt die zugehörige Blase/den Kurventext im Canvas aus.

## Reading-Order

Panels werden zunächst automatisch zu Y-"Zeilen" zusammengefasst (Panels, deren
vertikale Bounding-Box sich überlappt, gelten als eine Zeile — kein fester
Pixel-Schwellwert, funktioniert unabhängig von völlig unterschiedlich großen Panels),
innerhalb einer Zeile dann nach der projektweiten [Leserichtung](#projektverwaltung)
sortiert (rechts→links für Japanisch/Manga, links→rechts für westliche Comics).
Dieselbe Zeilen-+Leserichtungs-Logik bestimmt auch die Reihenfolge der Blasen
innerhalb eines Panels (bzw. im "Ohne Panel"-Sammelbecken) — das war zuvor eine reine
Y-Sortierung, die bei nebeneinanderliegenden Blasen/Panels auf ähnlicher Höhe keine
verlässliche Reihenfolge lieferte.

Zusätzlich hat jede Blase eine Leseposition innerhalb ihrer Gruppe (ihr zugeordnetes
Panel, oder der Sammelbecken "Ohne Panel"). Ein optionales Feld
(`readingOrderOverride`) erlaubt eine manuelle Korrektur für Fälle, in denen auch die
Zeilen-/Leserichtungs-Sortierung nicht der tatsächlichen Erzählreihenfolge entspricht
— der manuelle Override gewinnt dabei immer, unabhängig von der Leserichtung.
Bearbeitet wird das über die Hoch-/Runter-Buttons in der
[Kontextansicht](#kontextansicht) — ein Klick tauscht die Blase mit ihrem Nachbarn in
der Gruppe und nummeriert die ganze Gruppe neu durch, damit die Reihenfolge auch nach
mehreren Korrekturen eindeutig bleibt. Wird einer Blase ein anderes (oder gar kein)
Panel zugewiesen, wird ihr Override automatisch zurückgesetzt, da er nur innerhalb der
ursprünglichen Gruppe sinnvoll ist.

## Glossar

Projektweite Liste wichtiger Begriffe mit einer Übersetzung pro Sprache (wie
`Bubble.text`) und einer optionalen Notiz — verwaltet über ein Modal im "Projekt"-Menü
auf jedem Bildschirm (Anlegen, Bearbeiten per Klick auf einen Eintrag, Löschen). Sobald
ein Glossar-Eintrag eine Übersetzung für die gerade aktive Sprache hat, wird jedes
Vorkommen dieser Übersetzung **direkt im Textfeld einer Blase oder eines Kurventexts
farblich hervorgehoben**, während getippt wird — so sieht der Übersetzer sofort, wo ein
bereits abgestimmter Begriff verwendet wurde. Technisch eine transparente Textarea über
einem synchron mitscrollenden Hintergrund-Div (kein contentEditable — Cursor, Auswahl,
IME-Eingabe und Rückgängig funktionieren dadurch unverändert nativ). Bei vertikalem
(japanischem) Text wird bewusst nicht hervorgehoben — nur eine normale Textarea, da
vertikale Textumbrüche eine grundlegend andere Sonderbehandlung bräuchten.

## Kontextansicht

Einklappbare Seitenleiste (Werkzeugleisten-Symbol, schließt beim Öffnen automatisch die
Text-Liste und umgekehrt — beide docken an derselben Stelle), die zur aktuell
ausgewählten Blase anzeigt. Nützlich nicht nur beim Übersetzen — Sprecher, Lese-
reihenfolge und Panel-Ausschnitt helfen genauso beim reinen Lettern oder beim Schreiben:

- **Speaker** (samt Voice Notes, falls vorhanden) und das zugeordnete **Panel**.
- **Vorherige/Aktuelle/Nächste** Blase in Leserichtung — mit eigener, von der
  Haupt-Sprache unabhängiger Sprachauswahl. An einer Seitengrenze wird dafür
  **automatisch die Nachbarseite nachgeladen** (nur ihr Layout, nicht die volle
  Editor-Ansicht), sodass "Vorherige"/"Nächste" auch über Seiten hinweg funktioniert;
  ein Klick darauf wählt die Blase aus (gleiche Seite) oder navigiert zur Nachbarseite.
- Hoch-/Runter-Buttons bei der aktuellen Blase zum Korrigieren der
  [Reading-Order](#reading-order) innerhalb ihrer Gruppe.
- Ein **Bildausschnitt** des aktuellen Panels (aus dem Quellbild der aktuellen Seite
  zugeschnitten, keine Nachbarseiten-Bilder) — oder ein Hinweis, falls die Blase keinem
  Panel zugeordnet ist.

## Skript-Editor & Skript-Sidebar

Zwei bewusst getrennte, aber datenmäßig verbundene Werkzeuge für die Planungsphase vor
dem eigentlichen Lettern — Plot, grobe Panel-Aufteilung, Bildkomposition und
mehrsprachiger Dialogtext, unabhängig vom später gescannten Seitenbild und dessen
Blasen/Panels.

### Skript-Editor (eigenständiger Bildschirm)

- Genau ein Skript-Dokument pro Band (`<Band><scriptSuffix>.json`, Suffix in den
  Einstellungen konfigurierbar, Standard `_script`), erreichbar über den Eintrag
  "Skript" im "Projekt"-Menü der Seiten-Übersicht/des Editors.
- Seiten-Liste (frei benennbares Label, Notizfeld, verschiebbar/löschbar), darin Panels
  (Größen-Hinweis klein/mittel/groß, Bildkomposition- und Handlungs-Freitext), darin
  Dialogzeilen (Charakter-Dropdown inkl. Voice-Notes-Anzeige, Regieanweisung, ein
  Textfeld pro Projekt-Sprache mit Glossar-Hervorhebung).
- "Kopieren"-Button pro Dialogzeile legt den Text der gerade gewählten Skript-Sprache in
  die Zwischenablage — die einzige Brücke zum späteren Seiten-Editor, bewusst ohne
  engere Kopplung.
- Rein manuelles Speichern (kein Autosave), wie der Rest der Skript-Funktionalität.

### Skript-Sidebar (im Seiten-Editor)

- Einklappbare Seitenleiste, die eine echte Seite mit genau einer Skript-Seite
  verknüpft (`linkedPage`, einmalig gesetzt, dauerhaft im Skript-Dokument gespeichert —
  eine strukturell erzwungene 1:1-Zuordnung).
- Volle Bearbeitung wie im Skript-Editor (Panels/Dialogzeilen hinzufügen, verschieben,
  löschen) direkt neben dem Canvas, plus ein zusätzlicher "In Blase einfügen"-Button pro
  Dialogzeile: bei ausgewählter Blase schreibt ein Klick den Text direkt in
  `bubble.text[aktive Sprache]`, ganz ohne Zwischenablage-Umweg. Ohne Auswahl bleibt nur
  der Kopieren-Button aktiv.
- "Verknüpfung aufheben" trennt Seite und Skript-Seite wieder, ohne deren Panels zu
  löschen — im Skript-Editor bleibt die Skript-Seite unverändert erhalten, nur ohne
  Verknüpfung.

### Skript aus fertig geletterten Seiten generieren

Statt eine Skript-Seite von Hand zu befüllen, lässt sie sich direkt aus einer bereits
geletterten Seite erzeugen — ein Panel pro echtem Panel (in Leserichtung) plus ein
Sammel-Panel für Blasen ohne Zuordnung, je mit einer Dialogzeile pro Blase (Charakter
und Text pro Sprache 1:1 übernommen). Bildkomposition, Handlung und Größen-Hinweis
lassen sich aus Blasendaten nicht ableiten und bleiben leer, zum Nachtragen von Hand.

- **Pro Seite**: Der "+ Aus dieser Seite erzeugen"-Button in der Skript-Sidebar befüllt
  die neue verknüpfte Skript-Seite direkt aus den Blasen der gerade offenen Seite.
- **Für den ganzen Band**: Der Button "Aus geletterten Seiten generieren" im
  Skript-Editor generiert in einem Schritt für **jede** Seite mit einer gespeicherten
  Lettering-Datei, die noch nicht mit einer Skript-Seite verknüpft ist — bereits
  verknüpfte Seiten werden übersprungen, um von Hand ergänzte Inhalte (Bildkomposition,
  Handlung, Notizen) nicht zu überschreiben.
- Beide Wege ändern nur den Arbeitsspeicher-Zustand — wie überall im Skript-Bereich muss
  anschließend bewusst "Speichern" geklickt werden, damit es auf der Platte landet.

## Berichte

- **Seiten-Bericht**: Vier live berechnete Ansichten für die aktuell geöffnete Seite —
  "Wer sagt was?" (jede Blase in Leserichtung mit zugeordnetem Charakter und Text),
  dasselbe gruppiert nach Panel ("Wer sagt was in welchem Panel?", mit einem
  "Ohne Panel"-Sammelbecken für nicht zugeordnete oder auf gelöschte Panels
  verweisende Blasen), "Welche Charaktere kommen auf der Seite vor?" (eindeutige
  Charakterliste) und "Welche Charaktere kommen in welchen Panels vor?".
- **Band-Bericht**: Aggregiert dieselben Daten über jede *bereits gespeicherte* Seite
  des Bandes (noch nie geöffnete/gespeicherte Seiten werden übersprungen) — welche
  Charaktere im gesamten Band vorkommen und auf welchen Seiten, plus eine
  Seiten-für-Seiten-"wer sagt was"-Übersicht mit eigener Sprachauswahl.
- Seiten- und Band-Bericht teilen sich dieselbe Auswertungslogik, damit beide nie
  unterschiedliche Definitionen verwenden.

## Export & Import

- **PNG-Export**: Rendert Seitenbild plus alle Blasen/Bilder/Kurventexte einer
  gewählten Sprache auf einen Canvas und lädt das Ergebnis-PNG zum Server hoch, der es
  im passend benannten Export-Ordner ablegt. Wählbarer Seitenbereich (aktuelle Seite /
  alle / gerade / ungerade / Zahlenbereich / eigene Liste wie `1,3,5,10-14`), ein Filter
  "nur Seiten mit Übersetzung für diese Sprache" (überspringt Seiten ohne Inhalt in der
  Zielsprache), und ein Sprachfilter (alle oder nur eine). Fortschritt wird live
  angezeigt.
- **Druck-Export (TIFF, CMYK)**: zusätzliches Ausgabeformat neben PNG, im selben
  Export-Dialog wählbar (gleicher Seiten-/Sprachfilter). Nutzt exakt dasselbe
  gerenderte Bild wie der PNG-Export — nur die Nachbearbeitung unterscheidet
  sich: der Server konvertiert es serverseitig (`sharp`) nach CMYK und schreibt
  es als `.tiff` mit einer 300dpi-Auflösungsangabe in denselben Sprachordner.
  Bewusst einfach gehalten: **keine Pixel-Neuberechnung** (die Auflösungsangabe
  ist reine Metadaten, ein niedrig aufgelöster Scan wird nicht künstlich
  "geschärft") und **generische CMYK-Konvertierung** (kein eigenes
  FOGRA-/SWOP-ICC-Profil) — löst nicht das Vektortext-Problem professioneller
  Druckvorstufen (siehe `docs/Professional-Workflow-Gaps.md`), macht den
  bestehenden Raster-Export aber überhaupt erst druckfähig (PNG kennt technisch
  keinen CMYK-Farbraum).
- **Rendering-Grundlagen**: Schrumpf-zu-Passform + Umbruch für horizontalen Text,
  vollständige Tategaki-Engine (erzwungene Umbrüche, Furigana-Läufe,
  Tate-chū-yoko-Ziffern-/Lateinläufe, Kana-Verkleinerung/-Versatz, Kinsoku-Shori-
  Umbruchregeln), Homographie-Verzerrung von Text/Bild in ein beliebiges Viereck,
  gemeinsame Konturen-/Schwanz-Zeichenlogik für Blasenstile (identisch zwischen
  Live-Vorschau und PNG-Export, damit beide nie auseinanderlaufen), gemeinsame
  Volltonfarbe-/Farbverlauf-/Umrandungs-Zeichenlogik für Text, SVG-Konturen-Parsing
  (größte Bounding-Box-Geometrie wird gewählt, falls die SVG mehrere enthält).
- **JSON-Export/-Import** (Seiten-Ebene): Das Layout einer einzelnen Seite kann als
  JSON heruntergeladen und wieder importiert werden (gegen das Zod-Schema validiert —
  ein Formatfehler zeigt eine Fehlermeldung statt die Seite still zu beschädigen);
  ersetzt dabei nur das Blasen-Array, nicht Bilder/Kurventexte/Panels.
- **JSON-Export/-Import** (Band-Ebene): Alle gespeicherten Seiten-Layouts eines Bandes
  können als ein ZIP heruntergeladen werden; ein ZIP mit Layout-JSONs kann umgekehrt
  importiert werden (ungültige/beschädigte Einträge im ZIP werden einzeln übersprungen
  und gemeldet, statt den ganzen Import abzubrechen).

## Schriftarten

Eigene Schriftdateien (`.ttf`/`.otf`/`.woff`/`.woff2`) können hochgeladen werden und
sind danach pro Blase/Kurventext per Dropdown wählbar. Schriften werden einmalig über
die `FontFace`-API des Browsers registriert und zwischen Live-Vorschau und
PNG-Export geteilt (beide warten explizit auf denselben Ladevorgang), damit eine
Schrift nie in der Vorschau anders aussieht als im Export. Ein interner Zähler sorgt
dafür, dass Blasen nach dem Laden der echten Schrift neu gezeichnet werden (statt beim
anfänglichen Ersatzschrift-Rendering zu bleiben).

## Projekt-Assets-Ordner

Schriften, SVG-Blasenkonturen und die Bild-Bibliothek liegen standardmäßig projektweit
gemeinsam in einer globalen Bibliothek. In den Einstellungen kann zusätzlich ein
projekteigener Assets-Ordner hinterlegt werden (analog zum Projekt-Ordner, mit
Datei-Browser und Existenz-Prüfung) — darin legt das Tool automatisch die Unterordner
`fonts/`, `images/` und `bubble-svgs/` an.

- **Additiv, nicht ersetzend**: Die gemeinsame Bibliothek bleibt für jedes Projekt
  weiterhin sichtbar/nutzbar, auch wenn ein eigener Assets-Ordner konfiguriert ist. Der
  Projekt-Ordner kommt als zusätzliche Ebene obendrauf.
- **Namenskollision**: Hat eine Datei im Projekt-Ordner denselben Dateinamen wie eine in
  der gemeinsamen Bibliothek, gewinnt die Projekt-Version — sowohl in der Liste
  (Font-/Bild-/SVG-Auswahl) als auch beim Ausliefern.
- **Upload-Ziel**: Neue Uploads landen automatisch im Projekt-Ordner, sobald einer
  konfiguriert ist. Ist keiner konfiguriert (der Fall für alle Projekte ohne diese
  Einstellung), verhält sich alles wie zuvor — rein global, keine Migration nötig.
- Font-/Bild-/SVG-Auswahl zeigen projekteigene und gemeinsame Einträge getrennt
  gruppiert ("Projekt"/"Gemeinsam"), damit klar ist, was nur in diesem Projekt verfügbar
  ist.

**Ordnerverwaltung** (Bild-Bibliothek und SVG-Blasenkonturen, nicht Schriften): beide
Bibliotheken lassen sich in beliebig tiefe Unterordner gliedern (z. B. "Effekte",
"Icons"), um bei wachsender Sammlung schneller etwas wiederzufinden.
- Im jeweiligen Bild-/SVG-Picker-Popover navigiert man per Breadcrumb + Ordner-Chips
  durch die Struktur; ein Klick auf einen Ordner-Chip springt hinein, "+ Neuer Ordner"
  legt einen neuen Unterordner auf der aktuellen Ebene an. Ein Ordner lässt sich nur
  löschen, wenn er **auf beiden Seiten** (gemeinsame Bibliothek wie projekteigener
  Ordner) leer ist.
- Ein Upload landet automatisch im gerade geöffneten Ordner; bereits vorhandene Dateien
  lassen sich nachträglich per "In Ordner verschieben…"-Aktion an der jeweiligen
  Bild-Kachel einsortieren.
- Ein bereits platziertes Bild/eine SVG-Kontur merkt sich beim Einfügen ihren vollen
  Pfad (Ordner + Dateiname) — verschiebt man die Datei später in einen anderen Ordner,
  verweisen bereits vorhandene Platzierungen weiterhin auf den alten Pfad (kein
  automatisches Nachziehen aller Referenzen), genau wie beim Verschieben einer Datei
  im Dateisystem, während ein anderes Dokument noch den alten Pfad kennt.

**Thumbnail-Ordner** (Cache der Seiten-Vorschaubilder) ist ein eigenes, unabhängiges
Einstellungsfeld — kein Unterordner des Assets-Ordners, da reiner Rendering-Cache statt
kuratiertes Asset. Bleibt er leer, verwendet das Tool automatisch einen `thumbnails/`-
Ordner direkt neben der Projektdatei, statt (wie Fonts/Bilder/SVGs) auf eine gemeinsame
globale Bibliothek zurückzufallen — jedes Projekt bekommt so ohne weitere Konfiguration
seinen eigenen Cache-Ordner, unabhängig davon, ob überhaupt ein Assets-Ordner gesetzt ist.

## Undo/Redo

Ein einzelner Verlaufsstapel (max. 50 Einträge) aus vollständigen Seiten-Layout-
Momentaufnahmen, für alle Undo/Redo-Vorgänge. Diskrete Aktionen (Element
hinzufügen/entfernen, Auswahl löschen/duplizieren) sichern sofort eine
Momentaufnahme; fortlaufende Aktionen (Text tippen, Ziehen/Skalieren,
Pfeiltasten-Verschieben) werden gebündelt (600 ms Verzögerung), sodass ein ganzer
Vorgangs-Schub ein einziger Undo-Schritt wird (Zustand von *vor* Beginn des Schubs),
statt ein Schritt pro Tastendruck/Pixel. Undo/Redo hebt die aktuelle Auswahl auf.
Duplizieren versetzt Kopien um 24 px, damit sie nicht exakt auf dem Original liegen.

## Server-API

| Route-Datei | Zuständigkeit |
|---|---|
| `volumes.ts` | Erkannte Bände auflisten, inkl. vorhandener Sprachordner |
| `pages.ts` | Seiten eines Bandes auflisten, Vollbild + zwischengespeichertes Vorschaubild ausliefern |
| `layout.ts` | Seiten-Layout lesen/speichern (legt bei Bedarf ein leeres an), Band-weiter ZIP-Export/-Import, `/reports` für den Band-Bericht |
| `export.ts` | Hochgeladenes PNG entgegennehmen und im Export-Ordner ablegen |
| `languages.ts` | CRUD für die Sprachliste des Projekts, mit Konfliktprüfung auf doppelte Codes/Suffixe |
| `characters.ts` | CRUD für die Charakterliste des Projekts |
| `glossary.ts` | CRUD für die projektweite Glossarliste |
| `presets.ts` | CRUD für die projektweite Lettering-Preset-Liste |
| `settings.ts` | Projekteinstellungen lesen/ändern, inkl. Live-Prüfung der Scan-Wurzel |
| `images.ts` | Bild-Bibliothek hoch-/auflisten/ausliefern, mit Maßermittlung (global + [Projekt-Assets-Ordner](#projekt-assets-ordner) gemergt) |
| `fonts.ts` | Schriftdateien hoch-/auflisten/ausliefern (global + [Projekt-Assets-Ordner](#projekt-assets-ordner) gemergt) |
| `bubbleSvgs.ts` | Eigene SVG-Blasenkonturen hoch-/auflisten/ausliefern (global + [Projekt-Assets-Ordner](#projekt-assets-ordner) gemergt) |
| `browse.ts` | Serverseitiger Dateisystem-Browser (Laufwerke, Verzeichnislisten, optionaler `.json`-Filter) |
| `project.ts` | Aktuelles Projekt abfragen, zuletzt geöffnete Projekte, Projekt öffnen/anlegen |

## Fehlerbehandlung & Sicherheit

- **`asyncHandler`**: Umschließt jeden Express-Routen-Handler, damit ein
  geworfener/abgelehnter Fehler in einer async-Funktion tatsächlich bei `next()`
  landet — sonst würde die Anfrage einfach hängen bleiben statt eine Antwort zu
  liefern.
- **Globale Fehler-Middleware**: Ein spezieller "kein aktives Projekt"-Fehler wird zu
  einer 409-Antwort (damit der Client zum Projekt-Umschalter umleiten kann), alles
  andere wird serverseitig geloggt und als generischer 500-Fehler beantwortet.
- **Schutz vor Path-Traversal**: Jede datei-ausliefernde Route (Schriften, Bilder,
  SVG-Konturen) lehnt Dateinamen ab, die `..`, Pfadtrenner oder einen reinen
  `.`/`..`-Namen enthalten, bevor sie mit dem festen Speicherordner kombiniert werden —
  ein präparierter Dateiname kann so nicht auf beliebige andere Dateien zugreifen.
  Hochgeladene Dateinamen werden zusätzlich bereinigt, bevor sie geschrieben werden.

## Tests

Drei projekteigene Testdateien (Vitest), alle auf Unit-Ebene:

- `server/src/lib/paths.test.ts` — Pfad-/Ordnernamen-Vorlagen und die
  Path-Traversal-Prüfung.
- `server/src/lib/sharedSchemas.test.ts` — Validierung/Default-Werte der
  Projekteinstellungen- und Projektdatei-Schemas.
- `client/src/export/bubbleBackground.test.ts` — Geometrie-Hilfsfunktionen für
  Blasen-Konturen und welche Blasenstile einen Schwanz unterstützen.

Es gibt keine Ende-zu-Ende-/UI-Tests — die Abdeckung beschränkt sich auf gezielte
Unit-Tests rund um Schema-Validierung und Geometrie-Hilfsfunktionen.
