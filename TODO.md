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

- [x] **Visuelle Regressionstests** — `server/src/lib/pageRaster.visual.test.ts`,
      pixel-diff gegen eine eingecheckte Baseline-PNG (pixelmatch), deckt Bubble-
      Formen/Tail/Padding/Quad-Warp/Curved-Text in einem Render ab. Deterministisch
      bestätigt (zwei Läufe, 0 Pixel Abweichung) — @napi-rs/canvas bündelt seinen
      eigenen Skia-Rasterizer, daher OS-unabhängig, anders als ein Browser-Screenshot.
- [x] **Generischer Preset-Resolver** — `resolveLangField`/`resolvePresetField` in
      `shared/src/layoutSchema.ts` ersetzen die handgeschriebenen
      `override?.[lang] ?? preset?.X ?? base.X`-Ketten in resolveBubbleStyle/
      resolveBubbleForm/resolveCurvedTextStyle.
- [x] **Gemeinsame `<GovernedField>`-Komponente** — `client/src/editor/GovernedField.tsx`,
      in BubbleInspector.tsx **und** CurvedTextInspector.tsx eingesetzt (Letzteres hatte
      bisher gar keine Preset-Lock-Anzeige).
- [ ] **Command-Pattern fürs Undo** — noch nicht begonnen. Laut Recherche kein dünner
      Wrapper: `editorStore.ts` nutzt volle State-Snapshots (`past`/`future`-Arrays,
      `pushHistory()` vor jedem `set(...)`), kein Command-Objekt/execute-Interface —
      ein echtes Command-Pattern wäre ein Umbau aller ~15 Mutatoren, kein Aufsatz.
- [ ] **DOM-freies Shared-Rendering** — noch nicht begonnen.
- [x] **Code-Splitting** — alle Routen in `client/src/main.tsx` per React-Router-`lazy`
      statt statischem Import; Haupt-JS-Chunk von ~1,47 MB auf ~512 kB reduziert.
      AIPanel/OCR waren bereits eigene Chunks (Worker/dynamic import), nicht Teil
      dieser Änderung. `HydrateFallback` + Route-Loading-Indikator ergänzt.

## Batch B — Schnelles Arbeiten / Workflow-Tools

Alles rund um zügiges Durcharbeiten vieler Bubbles ohne Maus bzw. ohne durch
Menüs zu navigieren — teilt sich potenziell eine gemeinsame Tastatur-/
Befehls-Infrastruktur (Command Palette + Keyboard-Workflow + Shortcuts-Übersicht
sind natürliche Begleiter).

- [x] **Command Palette (Strg+K)** — `CommandPalette.tsx`, öffnet global (auch während im
      Textfeld getippt wird). Durchsucht alle aktivierten Menüaktionen (aus `menuGroups`
      übernommen, keine zweite Liste zu pflegen), Bubbles auf der Seite (nach Text),
      sowie — bei genau einer ausgewählten Bubble — Preset/Charakter-Schnellzuweisung.
      Export-Aktionen sind über die Menüaktionen bereits mit drin (Export-Panel/-Viewer/
      JSON-Export/Report zählen als Menüeinträge).
- [x] **Keyboard-Workflow-Modus** — Tab/Shift+Tab im Textfeld springt zur nächsten/
      vorherigen Bubble in Lesereihenfolge (wiederverwendet `getPageReadingOrder`),
      fokussiert automatisch das neue Textfeld. Bewusst NICHT auf reines Enter gelegt
      (Dialogtext ist oft mehrzeilig) — Ctrl/Cmd+Enter ist der Zusatzweg dafür.
- [x] **Sichtbare Tastenkürzel-Übersicht** — `ShortcutsModal.tsx`, aufrufbar über das
      Menü „Hilfe" (ersetzt den bisherigen Platzhalter-Eintrag).
- [x] **Mehrfachauswahl-Bulk-Edit** — `MultiSelectInspector.tsx` erweitert um Preset-
      Zuweisung, Padding- und Schriftgrößen-Bulk-Apply; neue `editorStore.updateSelectedBubbles()`-
      Mutation (unlocked-only, ein Undo-Schritt), mit Tests abgesichert.

## Batch C — Projektweite Textanalyse

Braucht einen durchsuchbaren Index über alle Bubble-Texte als gemeinsame Basis —
QA-Checker, Translation Memory und Batch Find & Replace scannen alle im Grunde
dieselbe Datenmenge und profitieren von derselben Infrastruktur.

- [x] **Such-Index statt Datei-Scan** — `client/src/editor/projectSearchIndex.ts`
      (`buildProjectSearchIndex`). Umgesetzt als client-seitige, parallelisierte
      (Promise.all) Aggregation über `api.listVolumes()` + das bereits existierende
      `api.getVolumeReport()` pro Band — passt zum bestehenden Muster (Reports werden
      schon client-seitig aus rohen Layouts gebaut, siehe VolumeReportModal.tsx), statt
      eine neue Server-Route/DB einzuführen. Bewusst ohne Cross-Request-Cache (immer
      frisch) — Staleness-Bugs in einer Such-und-ERSETZEN-Funktion wiegen schwerer als
      der Re-Scan-Aufwand. Basis für Translation Memory und Batch Find & Replace unten;
      QA-Checker bleibt bewusst pro-Band und nutzt nur `getVolumeReport()` direkt.
- [x] **QA-Checker** — `qaChecks.ts` (reine, getestete Funktion) + `QaCheckModal.tsx`,
      aufrufbar aus PageGrid.tsx („Seite"-Menü). Drei Checks: fehlende/leere
      Übersetzungen pro konfigurierter Sprache, unübersetzte Glossar-Begriffe (Quellbegriff
      taucht noch wörtlich in einer Sprache auf, für die eine andere Übersetzung hinterlegt
      ist), doppelte Preset-Namen. „Öffnen"-Button je Fund springt per neuem
      `?bubble=<id>`-Deep-Link (Editor.tsx) direkt zur betroffenen Blase.
- [x] **Translation Memory** — `translationMemory.ts` (Jaccard-Ähnlichkeit über
      Wort-Tokens, unicode-fähig für Japanisch) + Button „Ähnliche Texte suchen" im
      Textfeld-Tab von BubbleInspector.tsx. Bewusst kein Live-Vorschlag beim Tippen
      (Projekt-Index-Aufbau ist zu teuer dafür) und bewusst NUR innerhalb derselben
      Sprache verglichen (das Datenmodell kennt keine „Quellsprache" pro Blase, die man
      sprachübergreifend alignen könnte) — „habe ich diese Zeile/dieses SFX schon einmal
      irgendwo im Projekt übersetzt".
- [x] **Batch Find & Replace** — `findReplace.ts` (reine, getestete Funktion) +
      `BatchFindReplaceModal.tsx`, aufrufbar aus VolumeList.tsx („Projekt"-Menü, das
      einzige Level, das alle Bände auf einmal sieht). Vorschau mit Checkboxen vor dem
      Anwenden; beim Anwenden wird pro betroffener Seite frisch per
      `getLayoutWithEtag`/`saveLayout` (If-Match) geschrieben und die Ersetzung erneut
      gegen den frischen Text ausgeführt (nicht die Vorschau zurückgeschrieben) — dieselbe
      Optimistic-Concurrency-Absicherung wie beim normalen Editor-Speichern, nur für
      mehrere Seiten auf einmal.

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
