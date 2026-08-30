# TODO

Ideensammlung aus der Session vom 2026-08-30 (siehe Chat-Historie für die volle
Liste der Vorschläge). Ausgewählte Punkte, in Batches nach thematischer Nähe und
Abhängigkeit sortiert — nicht nach Priorität. Batch A ist als Fundament gedacht,
auf dem B–E aufbauen; B–E selbst sind untereinander unabhängig und können in
beliebiger Reihenfolge angegangen werden.

## Batch A — Fundament (Refactors)

Betrifft Code, auf dem mehrere der späteren Batches aufbauen bzw. der die exakte
Bug-Klasse verhindert, die in dieser Session zweimal auftrat (Clip/Padding bei
„none“-Bubbles). Sinnvoll zuerst, weil er das Risiko für alles Weitere senkt.

- [ ] **Visuelle Regressionstests** — automatisierte Snapshot-Vergleiche des
      gerenderten PNG/PDF-Outputs (Konva/Canvas/pdf-lib müssen identisch bleiben) —
      idealerweise vor den übrigen Refactors, damit sie ihre eigene Absicherung sind.
- [ ] **Generischer Preset-Resolver** — das `preset?.background.X ?? bubble.X`-Muster
      ist mehrfach von Hand dupliziert; ein typisierter Resolver verhindert diese
      Bug-Klasse strukturell.
- [ ] **Gemeinsame `<GovernedField>`-Komponente** — ScopeSwitch + PresetLock + Label
      sind aktuell an ~15 Stellen in BubbleInspector.tsx identisch verdrahtet.
- [ ] **Command-Pattern fürs Undo** — einheitliche Undo/Redo-Historie statt Feld für
      Feld ad hoc verdrahtet.
- [ ] **DOM-freies Shared-Rendering** — Layout-/Textmathematik in
      `shared/src/rendering` weiter von allem trennen, was einen Canvas/DOM-Shim
      braucht, für Testbarkeit ohne node-canvas-Overhead.
- [ ] **Code-Splitting** — AI/OCR-lastige Pfade per `dynamic import()` nachladen statt
      beim ersten Seitenaufruf (Client-Build meldet aktuell Chunks >500 kB).

## Batch B — Schnelles Arbeiten / Workflow-Tools

Alles rund um zügiges Durcharbeiten vieler Bubbles ohne Maus bzw. ohne durch
Menüs zu navigieren — teilt sich potenziell eine gemeinsame Tastatur-/
Befehls-Infrastruktur (Command Palette + Keyboard-Workflow + Shortcuts-Übersicht
sind natürliche Begleiter).

- [ ] **Command Palette (Strg+K)** — Schnellsuche/-sprung zu Seite, Bubble, Preset,
      Charakter, Export-Aktion.
- [ ] **Keyboard-Workflow-Modus** — Tab/Enter springt zur nächsten Bubble in
      Lesereihenfolge, für schnelles Lettering ganzer Seiten ohne Maus.
- [ ] **Sichtbare Tastenkürzel-Übersicht** — Cheat-Sheet für Canvas-Shortcuts,
      aufrufbar über das Menü „Hilfe".
- [ ] **Mehrfachauswahl-Bulk-Edit** — ein Preset, Padding oder Schriftgröße auf
      mehrere ausgewählte Bubbles gleichzeitig anwenden (Feature + sichtbares
      UI-Panel dafür).

## Batch C — Projektweite Textanalyse

Braucht einen durchsuchbaren Index über alle Bubble-Texte als gemeinsame Basis —
QA-Checker, Translation Memory und Batch Find & Replace scannen alle im Grunde
dieselbe Datenmenge und profitieren von derselben Infrastruktur.

- [ ] **Such-Index statt Datei-Scan** — Reports/Cross-Page-Suchen lesen aktuell
      vermutlich pro Anfrage alle Page-JSONs; ab einer gewissen Projektgröße lohnt
      ein leichter Index (SQLite/In-Memory) — Grundlage für die drei Punkte unten.
- [ ] **QA-Checker** — automatischer Konsistenz-Scan pro Volume: leere
      Übersetzungen, fehlende Sprachen, Glossar-Verstöße, doppelte Presets.
- [ ] **Translation Memory** — Vorschläge aus bereits übersetzten, ähnlichen Sätzen
      im selben Projekt, beim Tippen im Textfeld.
- [ ] **Batch Find & Replace** — projektweite Suche/Ersetzen über alle
      Bubbles/Volumes, mit Vorschau vor dem Anwenden.

## Batch D — Export-Pipeline

Server-seitige Export-Performance — Background-Jobs sind die Voraussetzung für
eine Batch-Queue (die Queue verwaltet ja mehrere solcher Jobs), Font-Caching
zahlt in dieselbe „Export schneller/robuster machen"-Richtung ein.

- [ ] **Export als Background-Job** — große Volume-Exporte (Raster/PDF/PSD) über
      eine Job-Queue mit Fortschritts-Polling statt blockierendem Request —
      Grundlage für die Batch-Queue unten.
- [ ] **Batch-Export-Queue** — mehrere Volumes/Formate hintereinander exportieren
      lassen, statt jedes einzeln manuell anzustoßen.
- [ ] **Font-Registrierungs-Cache** — `registerFont` wird pro Export-Call erneut
      aufgerufen; ein prozessweiter Cache senkt wiederholten Export-Overhead.

## Batch E — Canvas/Editor-Polish

Eigenständige UI-Verbesserungen ohne gegenseitige Abhängigkeit — jede für sich
klein genug, um unabhängig von den anderen Batches eingeschoben zu werden.

- [ ] **Live-Overflow-Warnung im Canvas** — rote Umrandung/Icon direkt an der
      Bubble, wenn Text trotz Schriftverkleinerung nicht passt.
- [ ] **Minimap/Übersicht** — bei Seiten mit vielen Panels/Bubbles, für schnelles
      Springen ohne Rein-/Rauszoomen.
- [ ] **Onboarding/Leerer-Zustand** — der aktuelle Hinweis ("Select a bubble...")
      ist sehr karg; kurze geführte Tour oder Illustration für Erstnutzer.
