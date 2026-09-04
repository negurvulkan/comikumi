# Feature-Liste

*[English version](FEATURES.md)*

Vollständige Übersicht aller Funktionen von ComiKumi, Stand aktueller Code. Diese
Datei ist eine Momentaufnahme — bei größeren Änderungen bitte hier mit nachziehen.

## Inhalt

- [Projektverwaltung](#projektverwaltung)
- [Konten, Rollen & Zugriffsschutz](#konten-rollen--zugriffsschutz)
- [Mehrbenutzerbetrieb](#mehrbenutzerbetrieb)
- [UI-Sprache](#ui-sprache)
- [Bände & Seiten](#bände--seiten)
- [Kapitel](#kapitel)
- [Sprachverwaltung](#sprachverwaltung)
- [Charakterverwaltung](#charakterverwaltung)
- [Story Bible](#story-bible)
- [Lettering-Presets](#lettering-presets)
- [Projekt-Assets-Ordner](#projekt-assets-ordner)
- [Editor — Canvas-Grundlagen](#editor--canvas-grundlagen)
- [Elementtypen](#elementtypen)
- [Auto-Bubbles (Erkennung & OCR)](#auto-bubbles-erkennung--ocr)
- [Bereinigung (Inpainting)](#bereinigung-inpainting)
- [Sperren](#sperren)
- [Cut-Panel](#cut-panel)
- [Text-Liste](#text-liste)
- [Reading-Order](#reading-order)
- [Glossar](#glossar)
- [Kontextansicht](#kontextansicht)
- [KI-Assistent](#ki-assistent)
- [Skript-Editor & Skript-Sidebar](#skript-editor--skript-sidebar)
- [Review-Kommentare](#review-kommentare)
- [Workflow-Status](#workflow-status)
- [Read/Review-Oberfläche](#readreview-oberfläche)
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
  Systemadministrator. Optionale **E-Mail-Adresse** pro Konto (selbst unter "Mein
  Konto" setzbar, oder von einem Systemadministrator) — wird ausschließlich für
  [@-Erwähnungs-Benachrichtigungen](#review-kommentare) verwendet, nirgends sonst
  gebraucht.
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

## Mehrbenutzerbetrieb

Mehrere gleichzeitig verbundene Personen sind der Normalfall (Studio-Netzwerk oder
gemeinsamer Server), daher drei gezielte Absicherungen gegen stille Datenverluste, plus
(neu) ein erster Schritt Richtung echter Mehrprojekt-Parallelität:

- **Optimistische Konflikterkennung beim Seiten-Speichern**: Der Editor merkt sich
  einen ETag (Inhalts-Hash) der zuletzt geladenen/gespeicherten Version einer Seite und
  schickt ihn beim Speichern mit. Hat in der Zwischenzeit jemand anderes dieselbe Seite
  gespeichert, erscheint statt eines stillen Überschreibens ein Dialog: **"Meine
  Version behalten"** (überschreibt die andere bewusst) oder **"Andere Version laden"**
  (verwirft die eigenen ungespeicherten Änderungen). Dasselbe ETag/If-Match-Muster
  steht serverseitig auch für den Skript-Endpunkt bereit (`GET`/`PUT .../script`),
  bislang ohne eigene Client-Oberfläche dafür.
- **Serialisiertes Schreiben** (kein Konflikt-Dialog, aber kein Datenverlust durch
  Verschränkung mehrerer gleichzeitiger Anfragen): Kommentare, Skript und
  Projekt-Metadaten (Einstellungen, Sprachen, Charaktere, Glossar, Presets,
  Mitgliederliste) serialisieren ihr Lesen-Ändern-Schreiben pro Datei über einen
  einfachen In-Prozess-Mutex — zwei gleichzeitig eintreffende neue Kommentare landen
  beide, statt dass einer den anderen verdrängt.
- **Warnung beim Projektwechsel**: Da der Server nur ein Projekt gleichzeitig aktiv
  halten kann, würde ein Wechsel (Projekt öffnen/neu anlegen) sonst anderen gerade
  aktiven Personen unbemerkt den Boden unter den Füßen wegziehen. War in den letzten
  fünf Minuten eine andere Person am Server aktiv, fragt der Client vor dem Wechsel
  nach ("{Namen} war(en) kürzlich aktiv — trotzdem wechseln?") statt sofort zu
  schalten; Bestätigen wechselt trotzdem.

- **Mehrprojekt-Zugriff, Phase 1+2 (serverseitig)**: Bisher lief der ganze Server mit
  genau einem aktiven Projekt im Speicher (ein globaler Singleton) — jeder Wechsel
  betraf zwangsläufig alle verbundenen Personen. Jedes Projekt bekommt jetzt eine
  stabile ID (`ProjectFile.id`, für Altprojekte beim ersten Laden einmalig vergeben und
  zurückgeschrieben), und der Server hält bis zu acht Projekte gleichzeitig in einem
  gedeckelten Cache (`server/src/lib/projectStore.ts`). Für **jeden** Inhalts-Router
  (Bände, Seiten, Layout, Export, Skript, Kommentare, Fonts/Bilder/SVGs, Sprachen,
  Charaktere, Glossar, Presets, Einstellungen) gibt es zusätzlich zu den bestehenden
  Routen neue, projekt-gescopte Routen unter `/api/p/:projectId/...`
  (`server/src/lib/projectContext.ts`) — zwei Anfragen mit unterschiedlicher
  `:projectId` sehen dadurch nachweislich unterschiedliche Projekte, unabhängig von der
  Reihenfolge.
- **Mehrprojekt-Zugriff, Phase 3 (Client-Umbau)**: Der Client kennt jetzt selbst ein
  Projekt in der URL — das komplette Bände-/Seiten-/Editor-/Skript-/Export-/Reader-
  Routenschema hängt unter `/p/:projectId/...` (`client/src/main.tsx`), statt implizit
  "das eine offene Projekt" zu meinen. Welches Projekt ein Browser-**Tab** gerade zeigt,
  ist ein reiner In-Memory-Wert pro Tab (`client/src/api/projectScope.ts`, bewusst nicht
  in `localStorage` wie der Auth-Token — sonst könnten zwei Tabs nie zwei verschiedene
  Projekte offen halten), gesetzt synchron beim Rendern von `ProjectProvider`
  (`client/src/state/ProjectContext.tsx`, wrappt weiterhin die ganze App-Hülle inkl.
  Kopfzeile) aus dem `:projectId`-Segment der aktuellen URL. Alle projekt-bezogenen
  `api.*`-Methoden (`client/src/api/client.ts`) gehen über einen `projectApiUrl()`-
  Helfer, der automatisch auf die gescopte Route umschreibt, mit ungescoptem
  `/api/...`-Fallback als Sicherheitsnetz. Ergebnis: zwei Browser-Tabs können jetzt
  wirklich zwei unterschiedliche Projekte gleichzeitig offen und in Bearbeitung haben,
  ohne sich gegenseitig zu beeinflussen — manuell mit zwei echten Tabs gegen einen
  laufenden Server verifiziert (inkl. Reload mitten in einer `/p/:id/volumes/...`-URL
  über die neue Bootstrap-Route `GET /api/p/:projectId`, und dem `/` → `/project`-
  Redirect für den Fall ganz ohne Projekt in der URL).

**Bewusst außerhalb (bisher)**: das Abschalten der ungescopten Legacy-Routen (Phase 4)
— bleiben als Sicherheitsnetz bestehen, bis sich der Client-Umbau in der Praxis bewährt
hat. Der Projekt-Umschalter selbst (`/api/project`, Anlegen/Öffnen/Archivieren/
Mitgliederverwaltung — operiert ohnehin auf Projekt*dateien*, nicht "dem gerade offenen
Projekt") sowie die serverweite Dateisystem-Suche bleiben bewusst Singleton-only, das
betrifft kein einzelnes Projekt. Konflikt-Erkennung für die selteneren
Verwaltungslisten (Einstellungen/Sprachen/Charaktere/Glossar/Presets/Mitgliederliste —
dort nur der Schreib-Mutex, kein ETag-Dialog) bleibt ebenfalls offen; siehe
`docs/Professional-Workflow-Gaps.md`.

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
- **Clip Studio Paint (.clip) importieren**: Über "Seite → CLIP-Datei importieren…"
  lassen sich eine oder mehrere `.clip`-Projektdateien direkt als neue Seiten
  hinzufügen — kein offizielles .clip-Format-SDK existiert, die Datei wird eigenständig
  geparst (siehe [`docs/clip-parser-provenance.md`](clip-parser-provenance.md)).
  ComiKumi setzt die Seite in voller Auflösung aus den einzelnen Ebenen-Kacheln der
  Datei zusammen, wenn alle sichtbaren Ebenen reine Raster-/Papierebenen mit einem
  bekannten, verifizierten Pixel-Format sind; ist das nicht der Fall (z. B. Vektor-,
  3D- oder Verlaufsebenen, oder ein noch nicht unterstütztes CSP-internes
  Pixel-Format), fällt der Import automatisch auf CSPs eigene, in der Datei
  eingebettete Vorschau-Rasterung des flachgelegten Canvas zurück — technisch bedingt
  bei ungefähr der halben linearen Auflösung der echten Zeichenfläche, aber garantiert
  vollständig. Welche Qualitätsstufe eine importierte Seite bekommen hat, wird nach dem
  Import angezeigt. Konflikte (bereits vorhandene Seite mit demselben Namen) und eine
  ungültige `.clip`-Datei werden wie beim normalen Seiten-Upload behandelt bzw.
  einzeln gemeldet, ohne den restlichen Stapel abzubrechen.
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

## Kapitel

Leichtgewichtiges Tagging pro Band, keine eigene strukturelle Einheit — eine
Seite referenziert optional einen `type` ("Cover"/"Kapitel-Zwischenseite"/
"Story", genutzt für Cover-Erkennung und um Nicht-Story-Seiten von der
laufenden Seitennummerierung auszuschließen) sowie ein Kapitel. Die Kapitel-
*Reihenfolge* wird nie gespeichert: die Position eines Kapitels ergibt sich
immer aus der eigenen Seitenreihenfolge des Bandes (die erste ihm
zugewiesene Seite) — Kapitel- und Seitenreihenfolge können also nie
auseinanderlaufen.

- **Kapitel verwalten** ("Seite"-Menü) — eine einfache Anlegen-/Umbenennen-/
  Löschen-Liste. Jede Seitenkarte in der Seitenübersicht hat ein Dropdown
  zum Zuweisen/Ändern des Kapitels.
- **Visuelle Gruppierung in der Seitenübersicht**: Seiten werden mit
  Abschnittsüberschriften nach Kapitel angezeigt (nur sobald mindestens ein
  Kapitel existiert — ein noch nicht getaggter Band zeigt weiterhin ein
  schlichtes Raster). Liegen die Seiten eines Kapitels nicht zusammenhängend
  im Band, taucht sein Name einfach an einer weiteren Stelle als
  Abschnittsüberschrift erneut auf, statt die Lücke stillschweigend zu
  verbergen — ein sichtbarer Hinweis statt einer blockierten Aktion, da
  Drag-Umsortieren über Kapitelgrenzen hinweg nie automatisch das Kapitel
  einer Seite ändert.
- **Kapitel-Export**: Der Export-Dialog bekommt eine "Kapitel"-Option bei der
  Seitenauswahl (löst zum Kapitel gehörende Seiten auf, egal wo sie im Band
  liegen) — funktioniert für jeden Raster-/Druck-/Vektor-PDF-/PSD-Export. Der
  Export-Viewer-Bildschirm bekommt denselben Kapitel-Filter für ZIP- und
  CBZ-Downloads neben der Sprachauswahl, der das Archiv auf nur dieses
  Kapitel statt den ganzen Export-Ordner beschränkt.
- **CBZ-Kapitel-Lesezeichen**: Beim Bauen einer CBZ wird automatisch ein
  `Bookmark`-Attribut (ein sonst ungenutztes ComicInfo.xml-Feld) auf die
  erste Seite jedes Kapitels mit mindestens einer Seite geschrieben — Reader
  wie Komga/Kavita nutzen das für eine Kapitel-Navigation. Vollautomatisch,
  aus den bereits definierten Kapiteln abgeleitet — keine zusätzliche
  Konfiguration nötig.
- **Kapitel-Bewusstsein in Band-Bericht & QA-Check**: Der bandweite Bericht
  bekommt einen Kapitel-Filter (beschränkt "wer sagt was"/Charakterlisten auf
  ein Kapitel); der QA-Checker gruppiert seine Funde innerhalb jeder
  Kategorie zusätzlich nach Kapitel statt einer flachen Liste, mit eigenen
  Buckets für nicht getaggte Seiten und für Funde ohne Bezug zu einer
  einzelnen Seite (z. B. doppelte Presets).

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

## Story Bible

Eigener Bereich für Worldbuilding/Story-Inhalte (Charakterprofile, Orte, Objekte,
Fraktionen, ...) — ein **generisches Entitäten-System**, erreichbar über den neuen
"Story Bible"-Eintrag im "Projekt"-Menü (`client/src/routes/StoryBible.tsx`, eigene
volle Route unter `/p/:projectId/story-bible`, nicht als Modal wie die schlankeren
Manager).

- **Einträge** haben einen freien `type` (kein festes Enum — z. B. "character",
  "location", "item", "faction"; der Client schlägt beim Anlegen gängige Typen sowie
  bereits im Projekt verwendete vor), Name, Farbe, eine Kurzbeschreibung und ein
  Freitext-Notizfeld.
- **Echte Vereinheitlichung mit dem Blasen-Tagging, keine Doppelverwaltung**:
  `type === "character"`-Einträge sind exakt dieselben Datensätze, die auch für
  `Bubble.characterId` in der [Charakterverwaltung](#charakterverwaltung) genutzt
  werden (server/src/lib/projectStore.ts stellt für die alte `/api/characters`-API
  weiterhin dieselbe schmale Sicht bereit, intern aber auf denselben Daten) — ein
  Charakter umbenennen oder seine Notizen pflegen wirkt sich sofort auf beide Stellen
  aus, es gibt keine zwei getrennten Listen. Projekte, die vor diesem Feature angelegt
  wurden, werden beim ersten Laden automatisch und einmalig migriert (gleiche IDs
  übernommen, jede bestehende Blasen-Zuordnung bleibt unverändert gültig).
- **Referenzbilder/Sketches**: jeder Eintrag hat eine eigene Bildergalerie
  (Upload/Löschen einzelner Bilder), technisch auf demselben Asset-Router-Baustein wie
  die [Projekt-Assets](#projekt-assets-ordner) aufgebaut, nur mit einem eigenen
  Ordner pro Eintrag.
- **Beziehungen**: gerichtete, frei beschriftete Verknüpfungen zwischen zwei Einträgen
  (z. B. "ist Schwester von", "arbeitet für") — projektweite Liste, auf beiden
  verknüpften Einträgen sichtbar. Löschen eines Eintrags entfernt automatisch jede
  Beziehung, die ihn referenziert.
- **Rollen**: Lesen für jedes Projektmitglied; Einträge/Beziehungen anlegen/bearbeiten/
  löschen ab Rolle "translator" (wie beim Glossar — redaktioneller Inhalt, keine
  Lettering-Produktionsarbeit); Bilder hochladen/löschen ab Rolle "letterer" (wie jeder
  andere Asset-Upload in der App).

## Lettering-Presets

Projektweite, live verknüpfte Stil-Vorlagen (z. B. "Bubble Style", "Character Style",
"Narration Style", "SFX Style") für Textstil und Blasenhintergrund — verwaltet über ein
Modal im "Projekt"-Menü auf jedem Bildschirm (Anlegen, Bearbeiten per Klick auf einen
Eintrag, Löschen). Anwendbar auf Blasen **und** Kurventexte (Kurventexte nutzen nur den
Textstil-Teil, keinen Blasenhintergrund).

- **Sparse/granular pro Feld**: Ein Preset kann bewusst nur einen Teil der ~24 Felder
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
  Umrandung, Farbverlauf, Leuchten, Schlagschatten) und, nur für Blasen,
  Blasenhintergrund (Blasenstil, Füll-/Randfarbe, Randbreite, Hintergrund-Farbverlauf,
  Leuchten, Schlagschatten, Zeigerart inkl. Ketten-Details). Reine Geometrie
  (Position/Größe/Rotation, Tail-Spitze/-Anker/-Breite/-Krümmung) ist bewusst kein
  Preset-Feld — das sind Instanz-Eigenschaften einer einzelnen Blase, kein "Stil".
- **Zuordnung**: über ein Preset-Dropdown im Bubble-/Kurventext-Inspector, oder über das
  Rechtsklick-Kontextmenü im Canvas ("Preset zuweisen"-Untermenü, nur für Blasen). Jedes
  vom aktuellen Preset gesteuerte Feld wird im Inspector deaktiviert angezeigt (mit
  Hinweis, von welchem Preset es vorgegeben wird) — außer ein Sprach-Override dafür ist
  aktiv, der gewinnt immer. Ein "Vom Preset lösen"-Button friert alle aktuell vom
  Preset übernommenen Werte einmalig in die Blase/den Kurventext ein und entfernt die
  Verknüpfung, ohne dass sich optisch etwas ändert.
- **Starter-Bibliothek**: Eine "Aus Bibliothek hinzufügen"-Zeile bietet eine Handvoll
  mitgelieferter Presets ("Manga SFX", "Whisper", "Shout") — ein Klick fügt eine Kopie
  über denselben Preset-Erstellen-Aufruf in die projekteigene Preset-Liste ein, sofort
  genauso bearbeit-/löschbar wie jedes andere Preset. Wird nicht automatisch in neue
  Projekte vorbefüllt — ein Projekt bekommt diese Presets nur, wenn jemand explizit
  darauf klickt.

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
— Position, Breite und Krümmung sind alle per Canvas-Ziehgriff einstellbar. Die
Hintergrundfüllung kann statt einer Volltonfarbe auch ein linearer Farbverlauf sein
und/oder ein Leuchten und/oder einen Schlagschatten tragen — alle unabhängig
zu- und abschaltbar und kombinierbar (eine Blase kann Farbverlauf-Füllung,
farbiges Leuchten und dunklen Schlagschatten gleichzeitig haben). Leuchten/
Schlagschatten werden auf dem Blasenkörper und einem nahtlos verbundenen Zeiger
gezeichnet; ein freistehender oder Ketten-Zeiger wirft kein eigenes
Leuchten/keinen eigenen Schatten (eine bekannte Einschränkung, kein Bug).

Text-Optionen: Schriftart (eigene hochgeladene Schriften), Größe, Zeilenhöhe,
horizontale Ausrichtung, sowie Leserichtung — horizontal LTR, horizontal RTL, oder
vertikal (Tategaki) inklusive Furigana (`{漢字|かんじ}`) und automatischem
Tate-chū-yoko (seitlich liegende Zahlen-/Lateinlauf-Blöcke). Furigana
unterstützt sowohl Gruppen-Ruby (eine Lesung gleichmäßig über eine
mehrzeichige Basis verteilt, z. B. `{大人|おとな}`) als auch Mono-Ruby (ein
eigener `{basis|lesung}`-Block je Zeichen, z. B. `{東|とう}{京|きょう}`) — 2
oder mehr solcher Blöcke direkt hintereinander geschrieben bleiben automatisch
als ein Wort über einen Spaltenumbruch hinweg zusammen, derselbe Schutz, den
reine Mehrfach-Kanji-Wörter schon hatten. Vertikaler Text unterstützt außerdem
Bōten (圏点) — traditionelle japanische Betonungspunkte, das Äquivalent zu
Fett/Kursiv — über `{text*}` (z. B. `{最悪*}`), gezeichnet als kleiner Punkt
neben jedem markierten Zeichen; derselbe Wortzusammenhalt-Schutz für
mehrzeichige Läufe gilt auch hier. Bei einer vertikalen Blase fügen zwei
Werkzeugleisten-Buttons ("Furigana einfügen"/"Bōten einfügen") die passende
`{...}`-Syntax automatisch um die aktuelle Textmarkierung ein, statt sie von
Hand zu tippen — der Furigana-Button prüft dabei zusätzlich das
Projekt-Glossar (siehe [Glossar](#glossar)) und trägt eine hinterlegte Lesung
automatisch ein, wenn die Markierung einem übersetzten Begriff entspricht.
Text kann eine
Umrandung und/oder einen linearen Farbverlauf statt Volltonfarbe bekommen, dazu
unabhängig zu-/abschaltbares Leuchten und/oder Schlagschatten (alle vier
kombinierbar). Jedes dieser Stil-Felder (und die komplette
Form/Position/Größe/Rotation/Hintergrund) ist per Sprach-Umschalter überschreibbar.
Text-Leuchten/-Schlagschatten erscheinen im Editor, PNG- und PSD-Export; die
Textebene des Vektor-PDF-Exports bleibt echter Vektortext und trägt keinen der
vier Texteffekte (dieselbe bereits bestehende Einschränkung wie bei
Umrandung/Farbverlauf). Blasen können einem Panel und einem Charakter
zugeordnet werden.

**Effekt-Blasen (SFX)**: ein eigenes Werkzeug in der Werkzeugleiste, direkt
neben den drei Formen-Werkzeugen, zeichnet eine Blase genau wie das
Rechteck-Werkzeug, markiert sie dabei aber als Soundeffekt/Onomatopoetikum
statt gesprochenen Dialog. Jede bestehende Blase lässt sich über eine
Checkbox im Inspector nachträglich in diesen Modus versetzen (oder wieder
herausnehmen) — praktisch für bereits vorhandene SFX-Blasen aus der Zeit vor
dieser Unterscheidung. Eine Effekt-Blase bleibt eine ganz normale Blase (jede
Form, jeder Stil, Panel-/Charakter-Zuordnung, Translation-Memory-Matching
funktionieren weiterhin) — der einzige Unterschied: sie wird aus den
„Wer sagt was"-Berichten, aus den beim automatischen Skript-Erzeugen
generierten Dialogzeilen (siehe [Skript-Editor & Skript-Sidebar](#skript-editor--skript-sidebar))
und aus der Fehlende-Übersetzung-QA-Prüfung ausgeschlossen — für nichts davon
ergibt ein Soundeffekt Sinn. In der Lesereihenfolge-Navigation und im
Layers-Navigator (siehe [Sperren](#sperren)) taucht sie weiterhin ganz normal
auf, dort mit der Kennzeichnung „Effekt" statt „Bubble".

**Anschneiden**: eine Rechteck-/Oval-/Denk-/Schrei-/SVG-Blase lässt sich an einer
geraden Linie anschneiden — frei auf dem Canvas per zwei Greifern gezogen, mit
einem „An Panelkante ausrichten"-Button im Blasen-Inspector, der eine
Start-Linie von der nächstgelegenen Kante des zugewiesenen Panels vorschlägt
(ein einmaliger Vorschlag, keine dauerhafte Bindung — das Panel kann sich
danach bewegen, ohne dass die Linie mitgezogen wird). Ein „Flip"-Umschalter
kehrt um, welche Seite der Linie behalten wird. Text rückt automatisch von der
abgeschnittenen Seite ab, damit er nie in sie hineinläuft. Nicht verfügbar für
„Quad"-Blasen.

**Verschmelzen**: zwei oder mehr Rechteck-/Oval-/Denk-/Schrei-/SVG-Blasen
lassen sich zu einem durchgehenden Umriss verschmelzen (die geometrische
Vereinigung ihrer Einzelformen — z. B. werden zwei überlappende Ovale zu einer
tailliert eingezogenen „Achter"-Form) über „Blasen verschmelzen" im
Mehrfachauswahl-Inspector, nicht-destruktiv: die Ursprungsblasen behalten ihre
eigenen Daten, nur eine (die „Primär-Blase", die zuerst ausgewählte) trägt den
gemeinsamen, durchlaufenden Text und das Schwänzchen der verschmolzenen Form —
der eigene Text/das eigene Schwänzchen der übrigen Mitglieder wird während der
Verschmelzung nur ausgeblendet, nicht gelöscht. „Verschmelzung aufheben"
stellt jede Ursprungsblase exakt wieder her, inklusive jedes Texts, den sie
vor der Verschmelzung trug. Nicht verfügbar für „Quad"-Blasen; nur im
Live-Editor und beim PNG-Export unterstützt (nicht in den Vektor-PDF-/PSD-
Exportpfaden).

**Innenabstand**: der Abstand zwischen Blasenumriss und Text folgt normalerweise
einem automatischen Standardwert pro Form. Eine Checkbox im Blasen-Inspector
erlaubt es, diesen Wert pro Blase zu überschreiben — mit einem Schieberegler
von 0–90 % statt nur dem festen Automatik-Wert, praktisch für Blasen, bei denen
das automatische Padding zu eng oder zu großzügig wirkt. Dasselbe Feld lässt
sich auch in einem [Preset](#lettering-presets) setzen, um einen Padding-Wert
auf alle verknüpften Blasen gleichzeitig anzuwenden. Wirkt identisch in jedem
Exportpfad (PNG, Vektor-PDF, PSD); nicht verfügbar für „Quad"-Blasen.

**Formangepasster Zeilenumbruch**: für ovale Blasen kann eine Checkbox im
Blasen-Inspector (oder ein [Preset](#lettering-presets)-Feld) einschalten,
dass die nutzbare Breite jeder Zeile aus der tatsächlichen Ellipsenform der
Blase abgeleitet wird — Zeilen in der vertikalen Mitte dürfen dadurch breiter
sein, Zeilen nahe Ober-/Unterkante schmaler, statt alle gleich in ein festes,
pauschal eingerücktes Rechteck zu passen. Gilt für horizontalen wie
vertikalen (Tategaki-)Text; Standardmäßig aus, damit bereits geletterte
Seiten sich nicht unbemerkt anders umbrechen. Pro Sprache einstellbar, genau
wie Schriftgröße/Ausrichtung/Leserichtung — eine Sprache mit besonders langer
Übersetzung kann es gezielt einschalten, während andere beim einfachen
Rechteck bleiben. Wirkt identisch im Live-Editor, PNG-Export, Vektor-PDF und
PSD-Export. Nicht verfügbar für „Rechteck"- und „Quad"-Blasen (bei Rechteck
ohnehin wirkungslos, Quad hat eine eigene Text-Warp-Pipeline).

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
Ausrichtung entlang der Kurve (Anfang/Mitte/Ende),
Farbe/Umrandung/Farbverlauf/Leuchten/Schlagschatten, alle mit demselben
Sprach-Umschalter-Muster.

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

## Auto-Bubbles (Erkennung & OCR)

Ein Werkzeug in der Werkzeugleiste, das Sprechblasen automatisch findet,
statt jede von Hand zu zeichnen — läuft komplett clientseitig (kein
Server-Roundtrip, keine Daten verlassen den Browser) in zwei Schritten:

1. **Erkennung**: ein Text-Bereichs-Detektor findet jede wahrscheinliche
   Sprechblasen-Fläche auf der aktuellen Seite und zeichnet eine Box darum.
2. **Erkennung des Texts (OCR)**: der Text innerhalb jeder gefundenen Box
   wird automatisch ausgelesen und vorausgefüllt — die meisten Blasen
   brauchen dadurch gar kein manuelles Eintippen mehr.

Beide Modelle laden beim ersten Gebrauch nach (große Dateien, danach dauerhaft
im Browser zwischengespeichert — kein erneuter Download bei Reload) und
laufen über WebGPU, wo verfügbar, mit automatischem Fallback auf WASM. Jedes
Ergebnis — Boxen-Position, erkannter Text und ein Konfidenz-Wert — erscheint
in einem **Review-Panel**, bevor irgendetwas auf die Seite übernommen wird:
jede Region kann einzeln bestätigt, bearbeitet oder verworfen werden; nur
bestätigte Regionen werden nach der Bestätigung zu echten Bubbles. Ohne
diesen Review-Schritt wird nichts automatisch auf die Seite geschrieben.

Der OCR-Schritt funktioniert nur für japanischen Quelltext — das zugrunde
liegende Modell hat ein rein japanisches Zeichen-Vokabular, jede andere
Schrift (lateinisch, kyrillisch usw.) erzeugt konstruktionsbedingt
voraussichtlich bedeutungslosen Text, kein leeres oder erkennbar unsicheres
Ergebnis. Der Boxen-Erkennungs-Schritt ist sprachunabhängig und bleibt für
sich genommen nützlich, um Blasen-Positionen auf jeder Seite zu finden — bei
nicht-japanischem Quelltext bleibt es beim manuellen Eintippen im
Review-Panel, wie vor diesem Feature. Beide Modelle sind Drittanbieter-Gewichte unter
freizügiger Lizenz (Apache-2.0/GPL-3.0), vollständig dokumentiert in
`docs/ocr-model-provenance.md`.

## Bereinigung (Inpainting)

Ein Werkzeug in der Werkzeugleiste ("Seite bereinigen"), das den originalen
gedruckten Text innerhalb erkannter Sprechblasen-Regionen entfernt und die
darunterliegende Zeichnung rekonstruiert — nutzt denselben clientseitigen
Detektor wie Auto-Bubbles (siehe oben) zum Finden der Regionen, schickt sie
dann an den Server, der die eigentliche Rekonstruktion übernimmt (ein
deutlich schwereres Modell als der Detektor — siehe unten, warum genau
dieser Schritt server- statt browserseitig läuft).

Bevor irgendetwas an den Server geschickt wird, öffnen die erkannten
Regionen einen **Masken-Editor** mit fünf Werkzeugen: **Rechteck** (aufziehen),
**Freihand** (beliebigen geschlossenen Umriss nachziehen), **Polygon**
(Eckpunkte anklicken, zum Schließen den ersten Punkt erneut anklicken) sowie
ein **Pinsel**, der wahlweise zur Maske hinzufügt oder von ihr entfernt
(aufziehen zum Malen/Löschen, Pinselgröße einstellbar) — der Detektor
markiert nur den gefundenen TEXT, was oft nicht die ganze Blase (Umriss,
Schwänzchen) oder SFX-Schrift abdeckt, weshalb diese Werkzeuge die Maske
frei in genau die gewünschte Form bringen lassen, nicht nur das, was der
Detektor zufällig gefunden hat oder ein Rechteck ausdrücken kann. Alle
Werkzeuge malen auf dieselbe zugrunde liegende Maske, sodass ein
Pinselstrich eine automatisch erkannte oder von Hand gezeichnete Region
genauso frei nachschärfen kann wie eine komplett neue markieren. Rückgängig
(Button oder Strg/Cmd+Z) geht die Mal-Historie schrittweise zurück, Leeren
setzt auf eine leere Maske zurück. Funktioniert auch, wenn die Erkennung gar
nichts gefunden hat — dann werden Regionen komplett von Hand markiert.

Das rekonstruierte Ergebnis erscheint danach als **Vorher/Nachher-Vergleich**,
bevor sich irgendetwas auf der Seite ändert — nichts wird übernommen, bis
auf "Übernehmen" geklickt wird. Das Übernehmen rührt den rohen Scan selbst
nicht an: es setzt nur ein Pro-Seite-Flag ("bereinigtes Bild verwenden"),
das dann überall greift, wo der Seiten-Hintergrund gezeichnet wird —
Editor-Canvas, PNG-/Vektor-PDF-/PSD-Export, Thumbnails. Der Original-Scan
wird nie verändert oder gelöscht, und das Flag lässt sich jederzeit wieder
ausschalten, um ihn sofort wiederherzustellen.

Umfang dieser Version: eine Seite nach der anderen — Batch-/Kapitel-weite
Durchläufe sind eine mögliche spätere Erweiterung, noch nicht abgedeckt. Die
Rekonstruktions-Qualität hängt vom zugrunde liegenden Modell ab, das ein
allgemeines (nicht manga-trainiertes) Checkpoint ist — siehe unten —
weshalb auch bei präziser Maske auf komplexen handgezeichneten Hintergründen
sichtbare Artefakte auftreten können; der Masken-Editor löst "welcher
Bereich wird rekonstruiert", nicht "wie gut wird rekonstruiert".

Das Rekonstruktions-Modell (`Carve/LaMa-ONNX`, Apache-2.0) läuft auf dem
**Server**, nicht im Browser — bei ~200 MB und einer festen
512×512-Eingabegröße (Kacheln über die ganze Seite nötig) ist es deutlich
schwerer als die andernorts genutzten Detektor-/OCR-Modelle, und der Server
eignet sich gut für diese Art Bildverarbeitung im großen Maßstab. Das ist in
jeder von dieser App unterstützten Bereitstellung ein lokaler/selbst
gehosteter Server, bleibt also konsistent mit dem "deine Daten verlassen
nicht deine Infrastruktur"-Prinzip der App — nur eine andere
Maschinen-Grenze als beim rein clientseitigen Auto-Bubbles-Feature. Die
vollständige Lizenz-/Herkunftsprüfung des Modells ist in
`docs/inpainting-model-provenance.md` dokumentiert.

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

Ein Klick auf das eigene Schloss-Symbol eines Elements wirkt nur auf dieses Element —
ein gesperrtes Panel schützt auf diesem Weg nicht automatisch seine zugeordneten
Kind-Blasen (siehe [Elementtypen](#elementtypen) → Panels); die bleiben über ihr eigenes
Symbol unabhängig sperr-/bearbeitbar. Die Sperre wird im gespeicherten Layout nur dann mit
abgelegt, wenn das Element zuletzt gesperrt war (siehe `locked` in
[JSON-Format.de.md](JSON-Format.de.md#bubble)).

### Ebenen-/Panel-Navigator & Bulk-Sperren

Da Panels oft visuell über Blasen und anderen Overlays liegen, machen sie es manchmal
schwer, gezielt etwas darunter anzuklicken — und jedes Panel einzeln zu sperren ist
aufwendig. Der **Ebenen-Navigator** (Werkzeugleiste, neben dem Text-Listen-Symbol) löst
das: Er listet jede Blase, jedes Bild und jeden Kurventext der Seite gruppiert nach
zugehörigem Panel auf (Elemente ohne Panel landen in einer eigenen Gruppe), jeweils mit
eigenem Sperr-Symbol und anklickbarer Zeile zur Auswahl. Gruppen lassen sich
auf-/zuklappen, ein Klick auf den Panel-Gruppentitel wählt das Panel auf der Leinwand aus.

Aus dem Ebenen-Navigator, dem Panel-Kontextmenü und dem **Bearbeiten**-Menü stehen drei
Bulk-Aktionen zur Verfügung:

- **Alle Panels sperren/entsperren** — schaltet alle Panels der Seite auf einmal um
  (Blasen/Bilder/Kurventexte bleiben unberührt).
- **Panel + Inhalt sperren/entsperren** — Rechtsklick auf ein Panel (oder dessen
  Sperr-Symbol im Ebenen-Navigator) sperrt das Panel zusammen mit jeder ihm zugewiesenen
  Blase (`bubble.panelId`) in einem Schritt. Bilder und Kurventexte haben keine
  Panel-Zuordnung und sind nie Teil dieser Kaskade, selbst wenn sie visuell im
  Panel-Bereich liegen.
- **Auswahl sperren/entsperren** — bei einer Mehrfachauswahl (Shift-Klick) sperren die
  Sperren/Entsperren-Buttons im Mehrfachauswahl-Inspector alle ausgewählten Elemente
  unabhängig vom Typ in einem Schritt.

### Ebenenreihenfolge (Z-Order)

Blasen, platzierte Bilder und Kurventexte malen standardmäßig in einer festen
Reihenfolge (Bilder unter Blasen unter Kurventexten) — jedes davon lässt sich
aber explizit relativ zu den anderen umsortieren, z. B. damit ein Bild-Patch,
der einen Teil der Original-Grafik abdeckt, *vor* statt hinter einer Blase
liegt (nützlich, wenn ein Objekt im Panel — Haare, ein Arm, ein Gegenstand —
eine Blase optisch überlappen soll, was eine gerade Anschneide-Linie allein
nicht kann; siehe [Sprechblasen](#sprechblasen) → Anschneiden). Jede Blasen-/
Bild-/Kurventext-Zeile im **Ebenen-Navigator** hat „In den Vordergrund“/„In
den Hintergrund“-Buttons; das Rechtsklick-Kontextmenü einer Blase hat
dieselben zwei Aktionen. Panels selbst sind davon nicht betroffen — sie sind
eine editor-interne Referenzebene, immer ganz unten gezeichnet, nie
exportiert.

Wird überall respektiert, wo die Seite tatsächlich gerendert wird: Editor-
Canvas, PNG-Export und der geschichtete PSD-Export (jeder Blasen-/Bild-/
Kurventext-PSD-Layer wird entsprechend sortiert). Die eine Ausnahme ist der
Vektor-PDF-Export, der Cut-Panels/Bilder/Blasen-Hintergründe zu einer
Rastergrafik zusammenfasst, auf die echter Vektor-Blasentext anschließend
immer in einem separaten, obersten Durchgang gelegt wird — ein Bild, das
anderswo vor eine Blase gebracht wurde, liegt dort weiterhin hinter deren
Text.

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

Das Ersatzbild wird auf die Bounding-Box des aktuellen Panel-Polygons projiziert und auf
dessen tatsächliche Form geclippt (keine echte 4-Punkt-Perspektivverzerrung wie bei
platzierten Bildern/Viereck-Blasen — ein Panel-Polygon kann beliebig viele Eckpunkte
haben, nicht zwingend 4). Ein **„Passform"**-Umschalter im Inspektor legt fest, wie das
Bild in die Bounding-Box eingepasst wird: **„Strecken"** (Standard, verzerrt bei
abweichendem Seitenverhältnis) oder **„Seitenverhältnis erhalten"** (das Bild wird
zentriert eingepasst, ohne Verzerrung — mit Leerraum an den kürzeren Kanten statt
Streckung). Optional lässt sich zusätzlich ein Rahmen (Farbe + Breite) um das Ersatzbild
legen — anders als die Panel-Randfarbe (reine Editor-Kontur, nie im Export) wird dieser
Rahmen tatsächlich mit in den PNG-Export gezeichnet.

**Horizontal spiegeln**: unabhängig von Verschieben/Entfernen/Ersetzen lässt sich der
gezeigte Panel-Inhalt zusätzlich horizontal spiegeln — per Kontextmenü-Eintrag oder
Schalter im Panel-Inspector, **pro Sprache** einstellbar (wie jedes andere
[sprachabhängige Cut-Panel-Verhalten](#sprachabhängiges-verhalten)). Typischer
Anwendungsfall: eine Sprechrichtung/Bewegungsrichtung im Panel an eine geänderte
Leserichtung anpassen, ohne die Originalgrafik extern zu bearbeiten.

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

- **Furigana-Lesungen**: Ein Eintrag kann zusätzlich zur Übersetzung eine Lesung pro
  Sprache hinterlegen. Wird vom "Furigana einfügen"-Button des Blasen-Inspectors genutzt
  (siehe [Sprechblasen](#elementtypen)) — entspricht die Markierung einer
  Glossar-Übersetzung mit hinterlegter Lesung, wird diese automatisch eingesetzt, statt
  vom Übersetzer eingetippt werden zu müssen.

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

## KI-Assistent

Einklappbare Chat-Seitenleiste (Werkzeugleisten-Symbol, gleiche Docking-Stelle wie
Story Bible/Kontextansicht) im Seiten-Editor, im Skript-Editor und — für
bandweite Aktionen — in der Seitenübersicht. Der Chat-Verlauf ist rein
clientseitig für die laufende Sitzung, wird serverseitig nicht gespeichert.

Über reinen Chat hinaus unterstützt der Assistent zehn eng begrenzte agentische
Aktionen, alle nach demselben Muster: Eine passende Anfrage beantwortet die KI —
sofern auf der aktuellen Seite/im Band tatsächlich etwas Passendes existiert —
mit einem Review-Panel (Annehmen/Ablehnen pro Zeile, teils mit editierbarem Text)
statt mit einer Chat-Nachricht — nichts wird geschrieben, bevor "Übernehmen"
geklickt wird, und das Übernehmen selbst durchläuft denselben Speichern-Button,
dieselbe Rechteprüfung und dieselbe Konflikterkennung wie eine manuelle
Bearbeitung. Das ist kein natives Tool-Calling des Modells — jeder Provider wird
stattdessen angewiesen, in einem bestimmten JSON-Format zu antworten, was
identisch bei allen sechs Providern funktioniert (auch bei Codex, das aktuell
kein Tool-Calling anbietet), ohne providerspezifische Extra-Anbindung. Jede
andere Anfrage wird wie bisher als normaler Chat beantwortet.

Seitenbezogen (Panel im Seiten-Editor, nur die aktuelle Seite):

- **Fehlende Übersetzungen füllen** — ergänzt Blasen, denen in einer
  konfigurierten Sprache der Text fehlt, anhand einer anderen bereits
  vorhandenen Sprache derselben Blase.
- **Textüberlauf beheben** — für Blasen, deren aktueller Text selbst bei
  minimaler Schriftgröße nicht in die Box passt: Vorschlag für eine größere
  Box und/oder Schriftgröße.
- **Charaktere zuweisen** — schlägt vor, welcher Projekt-Charakter eine noch
  nicht zugewiesene Dialogzeile spricht.
- **Soundeffekte stylen** — schlägt Preset und Drehung für Soundeffekt-Blasen
  vor, die noch keinen Stil haben.
- **Lesereihenfolge korrigieren** — prüft die aktuelle Lesereihenfolge der
  Seite und schlägt eine korrigierte Abfolge vor (ein Alles-oder-Nichts-
  Vorschlag, nicht pro Zeile, da eine Teil-Umsortierung keinen Sinn ergibt).
- **Glossar-Begriffe extrahieren** — durchsucht die Dialogtexte der Seite nach
  wiederkehrenden Namen/erfundenen Wörtern und schlägt neue Glossar-Einträge vor.
- **Glossar-Verwendung korrigieren** — findet Blasen, die einen bereits
  festgelegten Glossar-Begriff unübersetzt lassen, und schlägt eine korrigierte
  Übersetzung vor.
- **Übersetzungsnotiz vorschlagen** — formuliert einen Review-Kommentar (auf
  Seitenebene oder an eine Blase gepinnt) zu einem Wortspiel, einer
  Zweideutigkeit oder einem kulturellen Verweis, der Aufmerksamkeit verdient.

Bandbezogen (ein zweites KI-Panel in der Seitenübersicht, Eintrag
"KI-Assistent" im Seite-Menü; rein textbasiert — es werden keine Seitenbilder
gesendet, da ein Band 100+ Seiten haben kann):

- **Kapiteleinteilung vorschlagen** — schlägt Kapitelnamen und Seitenbereiche
  anhand von Seitenbenennung/-reihenfolge vor.
- **Seitentyp vorschlagen** — schlägt Cover-/Kapitel-Zwischenseiten-Tags für
  Seiten vor, die noch auf dem Standard "Story" stehen, allein anhand von Name
  und Position (in der UI ausdrücklich als unsichere Vermutung markiert, da
  hier kein Seitenbild geprüft wird).

Ist die Checkbox "Kontext einbeziehen" dieses Panels aktiv, wird zusätzlich
eine kompakte Seiten-für-Seiten-Übersicht des ganzen Bands mitgeschickt
(Seitentyp, Anzahl Sprechblasen, und wie viele davon in jeder konfigurierten
Sprache Text haben) — genug, um reine Chat-Fragen wie "Welche Seiten haben
noch keine Texte?" oder "Welchen Seiten fehlt noch Englisch?" direkt zu
beantworten, ganz ohne eine der obigen Aktionen.

- **Sechs austauschbare Provider**, pro Konto konfiguriert unter "Mein Konto"
  (`/account`, verlinkt im Header). Nur die tatsächlich konfigurierten Provider
  erscheinen im Panel zur Auswahl:
  - Ein selbst hinterlegter **OpenAI-**, **Anthropic (Claude)-**,
    **Google (Gemini)-** oder **OpenRouter-API-Key** — jeweils verschlüsselt
    auf dem Server gespeichert, nie im Klartext an den Client zurückgegeben.
  - Eine **"Mit ChatGPT anmelden"**-Anmeldung über Codex (Device-Code-Flow —
    Code + Verifizierungslink anzeigen, dann auf einem beliebigen Gerät im
    Browser bestätigen).
  - Ein selbstgehosteter **Ollama**-Server — nur eine Basis-URL und ein lokal
    installierter Modellname (kein Geheimnis, keine Verschlüsselung). Die URL
    muss vom ComiKumi-**Server** aus erreichbar sein, nicht vom Browser des
    Nutzers — bei den meisten Setups bedeutet das: dieselbe Maschine oder
    dasselbe Netzwerk wie der Server.
- **Codex läuft als eigener, lang lebender Server-Subprozess pro Konto** mit
  isoliertem Zugangsdaten-Ordner (`server/data/codex-home/<Konto-ID>`) — mehrere
  Konten auf demselben ComiKumi-Server haben getrennte ChatGPT-Logins und können sich
  nie gegenseitig sehen. Der Prozess wird nach einigen Minuten Inaktivität beendet
  und bei der nächsten Frage automatisch neu gestartet.
- **Kontext pro Frage**: eine Checkbox "Aktuelle Seite einbeziehen" steuert, ob
  zusätzlich zur Frage automatisch mitgeschickt wird — im Seiten-Editor ein
  Transkript der aktuellen Seite (Panels in Lesereihenfolge, Sprecher + Text je
  Blase, Effekt-/Titeltexte) **plus das tatsächliche Seitenbild** (herunterskaliert
  auf max. 1280px, damit auch rein bildliche/dialoglose Panels beschreibbar sind);
  im Skript-Editor ein Transkript des gesamten Skript-Dokuments (Komposition,
  Handlung, Dialog je Panel). Wird bei jeder Frage neu gebaut, spiegelt also immer
  den aktuellen Bearbeitungsstand.
- Antworten werden **gestreamt** (Server-Sent Events) und als Markdown gerendert
  (eingeschränkt: kein rohes HTML, nur http(s)-Links).

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
- Effekt-Blasen (SFX) werden beim Erzeugen der Dialogzeilen übersprungen —
  siehe [Sprechblasen](#sprechblasen).

## Review-Kommentare

Eigenständiges, pro Band gespeichertes JSON-Dokument (`<Band><commentsSuffix>.json`,
Suffix in den Einstellungen konfigurierbar, Standard `_comments` — gleiches Muster wie
das Skript-Dokument), unabhängig vom Seiten-Layout — Kommentieren löst nie den
Übersetzer-Diff-Guard aus und "alle offenen Kommentare im Band" ist ein einzelner
Request. Jedes Projekt-Mitglied ab "Betrachter" darf lesen und kommentieren — Review/QC
ist kein eigenes Rollen-Konzept, sondern genau das, was "Betrachter" ohnehin schon
bedeutet, plus Kommentar-Schreibrecht.

- **Drei Markierungsarten** plus ein allgemeiner Seitenkommentar ohne Ortsbezug: **Pin**
  (Klick), **Box** (Ziehen, wie das Panel-Werkzeug) und **Freihand** (ein
  zusammenhängender Kritzel-Strich, z. B. zum Einkreisen/Unterstreichen einer Stelle).
  Marker sind nach dem Anlegen nicht mehr verschiebbar — nur Farbe/Deckkraft ändern sich
  je nach Status (offen = kräftig, erledigt = gedimmt).
- **Threads**: jeder Kommentar hat Antworten, einen Erledigt/Wiedereröffnen-Umschalter
  und lässt sich vom Autor oder einem Projekt-Admin löschen.
- **@-Erwähnungen** einzelner Accounts (Autocomplete über eine eigene, nicht
  Admin-beschränkte `mentionable-members`-Route) oder ganzer Projekt-Rollen (Betrachter/
  Übersetzer/Letterer/Admin — zur Sendezeit gegen die aktuelle Mitgliederliste
  aufgelöst, nie als Snapshot gespeichert). Löst, sofern die erwähnte Person eine
  E-Mail-Adresse hinterlegt hat, eine Benachrichtigungs-Mail mit Deep-Link zurück in den
  Editor aus (`server/src/lib/mailer.ts`, SMTP komplett optional konfiguriert — ohne
  `SMTP_HOST` bleibt es bei der In-App-Markierung, kein Fehler).
- **Sidebar**: alle Kommentare des Bands (nicht nur der aktuellen Seite), filterbar nach
  offen/erledigt/"erwähnt mich", springt seitenübergreifend per `?comment=`-Deep-Link
  (derselbe Mechanismus wie die E-Mail-Links).

## Workflow-Status

Ein Produktionsboard pro Band ("Seite → Workflow-Status…" im Seitenübersicht-Menü) —
für jede Seite ein **Bereinigung**-Status (seitenweit: die rekonstruierte Zeichnung
wird von jeder Sprache gemeinsam genutzt) plus **Übersetzung**-, **Lettering**- und
**QC**-Status je Projektsprache, jeweils mit optionaler Zuweisung. Beantwortet "wo
steht Seite 12?", ohne das aus Chat oder Kommentaren erschließen zu müssen: *Bereinigung
freigegeben, Übersetzung DE freigegeben, Lettering DE in Arbeit — zugewiesen an Hanjo,
QC DE ausstehend.*

- **Status-Werte**: Ausstehend → In Arbeit → Review angefragt → Änderungen nötig →
  Freigegeben. Eine Seite/Phase ohne gesetzten Status gilt überall dort, wo sie
  gelesen wird, als ausstehend — keine Initialisierung nötig für eine frisch
  hinzugefügte Seite oder Sprache.
- **Zuweisung**: jedes aktuelle Projekt-Mitglied, aus derselben nicht Admin-
  beschränkten Mitgliederliste wie bei den @-Erwähnungen der Review-Kommentare (nicht
  die Admin-only Mitglieder-/Rollenliste) — ein Übersetzer kann Lettering-Arbeit einem
  Letterer zuweisen, ohne selbst Admin-Zugriff zu benötigen.
- **Speicherung**: ein eigenständiges, pro Band gespeichertes JSON-Dokument
  (`<Band>_workflow.json`, fester Suffix — internes Bookkeeping, kein
  nutzerseitig umbenennbares Dokument, gleiche Konvention wie Seiten-Tagging/
  Seitenreihenfolge), unabhängig vom Seiten-Layout und vom eigenen Dokument der
  Review-Kommentare. Gleiches optimistisches Nebenläufigkeits-Verfahren (ETag/
  If-Match) wie jedes andere Pro-Band-Dokument — ein veraltetes Speichern lädt die
  aktuelle Version neu, statt die Änderung eines Teammitglieds stillschweigend zu
  überschreiben.
- **Berechtigungen**: jedes Projekt-Mitglied ab "Übersetzer" kann Status und
  Zuweisung ändern — leichtgewichtige Koordinationsinfo, keine inhaltliche Änderung,
  daher eine Stufe unter "Letterer", die die meisten inhaltsverändernden Aktionen
  verlangen. Betrachter können das Board öffnen, aber nicht bearbeiten.

## Read/Review-Oberfläche

Eigener, schlanker Lese-Screen (`/volumes/:id/read/:page`, Einstiegspunkte: "Lesen"-Icon
auf jeder Seiten-Karte sowie ein Menüeintrag in der Seitenübersicht) für QC-/Review-
Personen, die einen Band einfach nur bequem durchsehen wollen — ohne Werkzeugleiste,
Inspektoren oder Undo/Speichern-Mechanik des vollen Editors. Technisch dieselbe
Canvas-Engine wie der Editor (`PageCanvas.tsx` im `readOnly`-Modus), nur mit eigenem
Datenladen direkt über die API statt über den Editor-Store, da hier nie Layout-Daten
geschrieben werden.

- **Frei zoomen/verschieben** wie im Editor, zusätzlich **Zoom auf ein bestimmtes
  Panel**: ein Streifen anklickbarer Panel-Miniaturen unten am Bildschirmrand, in
  Lesereihenfolge sortiert (dieselbe Sortierung wie Berichte/Skript-Sidebar) — Klick
  zoomt die Ansicht exakt auf dieses Panel.
- **Seiten vor/zurück** — Pfeiltasten und Buttons, deren Richtung sich nach der
  eingestellten Leserichtung richtet (bei "rtl" blättert man nach links vor, wie ein
  echter Manga-Reader). Die tatsächliche Seiten-Reihenfolge bleibt unverändert, nur
  welche Taste "vorwärts" bedeutet, dreht sich um.
- **Charaktere, Glossar und Skript** in einem einzigen Info-Panel, alle rein lesend
  (keine Bearbeitungsformulare wie in den vollen Verwaltungsdialogen — ein
  Betrachter-Konto dürfte deren Schreib-Endpunkte ohnehin nicht aufrufen). Glossar-
  Einträge zeigen alle hinterlegten Sprachen auf einmal; das verlinkte Skript hat einen
  eigenen Sprachumschalter.
- **Kommentar-Werkzeuge** (Pin/Box/Freihand, siehe [Review-Kommentare](#review-kommentare))
  sind immer direkt in der Werkzeugleiste sichtbar — jederzeit eine Anmerkung machen,
  ohne einen zusätzlichen Klick.
- **Doppelseitenansicht**: zeigt die aktuelle Seite zusammen mit ihrer logischen
  Nachbarseite nebeneinander (Auto-Paarung, kein Cover-Sonderfall), in der eingestellten
  Leserichtung sortiert — bei „rtl" steht die früher gelesene Seite rechts, bei „ltr"
  links, wie in einem echten aufgeschlagenen Band. Vor/Zurück blättert dabei um zwei
  Seiten statt einer.
- **Seitenvergleich**: beliebige, frei wählbare Seiten (bis zu vier) lassen sich über
  einen Thumbnail-Picker gleichzeitig nebeneinander öffnen — jede Seite unabhängig
  zoom-/verschiebbar, mit eigenem Panel-Zoom und eigener Auswahl. Nützlich um z. B. eine
  frühere Seite als Stilreferenz neben die aktuelle zu legen. Jede angezeigte Seite hat
  ihren eigenen Lade-Zustand, statt beim Wechsel die ganze Oberfläche zu blockieren.

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
- Effekt-Blasen (SFX) sind aus jeder Berichtsansicht ausgeschlossen — sie sind
  kein Dialog, siehe [Sprechblasen](#sprechblasen).

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
- **CBZ-Export**: Im Export-Viewer kann der bereits exportierte Bildbestand einer Sprache
  zusätzlich zum bestehenden ZIP-Download als `.cbz` heruntergeladen werden (von
  Comic-Readern wie Komga/Kavita/ComicRack erkanntes Format). Anders als der generische
  ZIP-Download werden dabei nur Seitenbild-Dateien eingepackt (keine versehentlich im
  selben Ordner liegenden Druck-TIFFs/PDFs/PSDs), in echter Seitenreihenfolge (über die
  tatsächliche Seitenliste des Bandes, nicht die Ordner-Sortierung) und fortlaufend
  umbenannt (`0001.png`, `0002.png`, …), damit die Reihenfolge unabhängig von den
  Original-Dateinamen stimmt. `PageCount` wird immer aus der tatsächlich gepackten
  Seitenzahl berechnet, nie vom Nutzer vorgegeben.
- **CBZ-Metadaten-Dialog** (`CbzMetadataModal.tsx`, Schema in `shared/src/cbz.ts`): Vor
  dem CBZ-Download fragt ein Modal das komplette ComicInfo.xml-Feldset ab, in fünf Tabs
  gruppiert — jedes Feld ist optional, ein leeres Feld wird in der XML einfach
  ausgelassen:
  - **Basis & Serie**: Titel, Reihe, Nummer, Band, Zusammenfassung, Notizen.
  - **Mitwirkende**: Autor, Zeichner, Inker, Kolorist, Letterer, Cover-Zeichner,
    Redaktion, Übersetzer.
  - **Veröffentlichung**: Verlag, Imprint, Jahr/Monat/Tag, Web-Link, Sprache (ISO,
    vorbelegt mit dem Code der gewählten Export-Sprache).
  - **Kategorisierung**: Genre, Stichwörter, Altersfreigabe (Dropdown mit den
    ComicInfo-Standardwerten), Leserichtung (`Manga`-Feld — Dropdown "Automatisch"
    übernimmt die Leserichtung des Projekts, oder explizit `Yes`/`No`/
    `YesAndRightToLeft`), Format, Scan-Informationen.
  - **Seiten**: Tabelle mit einer Zeile pro tatsächlich zu exportierender Seite (gleiche
    Filterung/Reihenfolge wie serverseitig) — pro Seite wählbarer `Type`
    (`FrontCover`/`Story`/`BackCover`/…, erste/letzte Seite sind vorbelegt) und eine
    `DoublePage`-Checkbox; ergibt den optionalen `<Pages>`-Block der ComicInfo.xml.

  Der Download läuft dafür als POST mit JSON-Body statt eines einfachen Downloadlinks
  (das volle Feldset inklusive Seiten-Tabelle kann eine Query-String-Downloadlink-URL
  sprengen) — die Antwort kommt als Blob zurück und wird per Objekt-URL + synthetischem
  Klick gespeichert.
- **Ebenen-PSD-Export**: eine Photoshop-Ebene je Sprechblase/Kurventext/
  platziertem Bild, plus Hintergrund- und Retuschen/Cut-Panel-Ebenen, sortiert
  passend zur eigenen [Ebenenreihenfolge](#ebenenreihenfolge-z-order) des
  Editors. Jede Ebene ist ein Rasterbild, das sich aus-/einblenden,
  verschieben und maskieren lässt. Eine experimentelle Opt-in-Checkbox
  ("Editierbare Text-Ebenen") gibt dafür geeigneten Sprechblasen zusätzlich
  ein echtes, mit dem Photoshop-Textwerkzeug editierbares Textobjekt mit —
  einfaches Rechteck/Oval, horizontal, Volltonfarbe, nicht mit einer anderen
  Blase verschmolzen (vertikaler/japanischer Text, Farbverläufe, Quad-Blasen
  und verschmolzene Blasen behalten ihre bisherige reine Raster-Ebene, da
  Photoshops native Text-Engine sie nicht abbilden kann). Eine solche Blase
  wird dabei zu zwei Ebenen ("… (Hintergrund)" und "… (Text)") statt einer,
  da eine Photoshop-Text-Ebene nicht gleichzeitig Umriss/Füllung der Blase
  tragen kann. Standardmäßig aus; Photoshop zeigt beim ersten Öffnen der
  Text-Ebene einen "Update"-Dialog — Bestätigen macht sie zu echtem, neu
  tippbarem Text.
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
| `comments.ts` | CRUD für [Review-Kommentare](#review-kommentare) (granulare Mutations-Routen statt Ganzdokument-PUT), `mentionable-members` für den @-Picker |
| `export.ts` | Hochgeladenes PNG entgegennehmen und im Export-Ordner ablegen, Export-Ordner als ZIP oder CBZ herunterladen |
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

Vitest, aktuell 51 Server- + 14 Client-Testdateien (538 + 166 Tests, Stand aktueller Code):

- **Server — Routen-Ebene** (`server/src/routes/*.test.ts`, per `supertest` gegen eine
  echte, temporäre Projekt-/Datenverzeichnis-Instanz — nie das reale `server/data/` oder
  echte Projektdaten): für praktisch jede Route-Datei eine eigene Testdatei, u. a.
  `volumes`, `pages`, `layout`, `export`, `script`, `comments`, `auth`, `project`,
  `characters`, `glossary`, `presets`, `settings`, `languages`, `fonts`, `images`,
  `bubbleSvgs`.
- **Server — Lib-Ebene** (`server/src/lib/**/*.test.ts`): Schema-Validierung/
  Default-Werte (`sharedSchemas`, `layoutSchema`), Pfad-/Ordnernamen-Vorlagen und die
  Path-Traversal-Prüfung (`paths`), Rendering-Geometrie und -Typografie
  (`rendering/textLayout`, `rendering/verticalTypesetting`, `rendering/curvedText`,
  `rendering/bubbleBackground`, `rendering/perspective`, `rendering/cutPanel` — inkl.
  der Regressionsprüfung, dass beim Cut-Panel-Rendern alle Loch-Füllungen vor allen
  Inhalts-Zeichnungen passieren, siehe [Cut-Panel](#cut-panel)), Seiten-Rasterung
  (`pageRaster`), Schriftauflösung (`fontResolver`), Vektor-PDF-/PSD-Aufbau
  (`vectorPdf/buildPdfPage`, `psdExport`), Auth-Store, Papierkorb-Sweep (`trash`) und
  den optionalen Mailer für Kommentar-@-Erwähnungen (`mailer`).
- **Client** (`client/src/**/*.test.ts`): reine Geometrie-/Auswahl-/Report-Logik, die
  sich Live-Vorschau und Export teilen — `export/pageSelection` (Seitenbereichs-Parsing),
  `editor/geometry`, `editor/reportUtils`, `state/editorStore`.

- **E2E** (`e2e/`, Playwright, eigenes Paket — nicht Teil von `npm test`): vier
  Kern-Abläufe im echten Browser gegen eine eigens dafür gestartete, isolierte
  Server-/Client-Instanz (eigene Ports 3101/4173, eigener `LETTERING_DATA_DIR`/
  Scan-Root unter `e2e/tmp-run/`, per `e2e/global-setup.ts` einmalig vor der Suite
  provisioniert über die bestehende Projekt-API, nicht die UI) — UI-Login, Projekt
  über den Projekt-Umschalter öffnen, eine Bubble anlegen/Text setzen/speichern (inkl.
  Reload-Check, dass es wirklich persistiert wurde), PNG-Export auslösen (geprüft per
  UI-Meldung **und** tatsächlicher Datei auf der Platte). Kein vollständiges Netz über
  jedes Feature — ein Grundgerüst für die wichtigsten Abläufe, auf dem sich gezielt
  weitere Specs ergänzen lassen (z. B. Kommentare, Cut-Panel, Reader). Siehe
  `README.md`'s "E2E tests"-Abschnitt für die Ausführung.
