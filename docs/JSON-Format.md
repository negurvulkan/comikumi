# Layout-JSON-Format

Jede Seite hat genau eine JSON-Datei (`<band>_lettering/page_XX.json`), die ihr komplettes
Lettering-Layout beschreibt: Sprechblasen, platzierte Bilder, Kurventexte, Panel-Markierungen
und deren Übersetzungen für alle Sprachen. Diese Datei ist die Single Source of Truth —
sowohl die Live-Vorschau im Editor als auch der PNG-Export lesen ausschließlich daraus. Das
Schema ist in `shared/src/layoutSchema.ts` als [Zod](https://zod.dev)-Schema definiert; diese
Datei beschreibt es in Prosa.

Alle Koordinaten/Maße (`x`, `y`, `width`, `height`, `strokeWidthPx`, Punkte in `corners`/
`points` etc.) sind **Pixel im Koordinatensystem des Quellbilds** (`imageWidth` ×
`imageHeight`), nicht Bildschirm- oder Zoom-Pixel.

## Grundgerüst (`PageLayout`)

```jsonc
{
  "page": "page_03",
  "sourceImage": "page_03.png",
  "imageWidth": 1476,
  "imageHeight": 2079,
  "bubbles": [ /* Bubble[] */ ],
  "images": [ /* ImageElement[] */ ],
  "curvedTexts": [ /* CurvedTextElement[] */ ],
  "panels": [ /* Panel[] */ ],
  "schemaVersion": 2
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `page` | string | Seitenname ohne Dateiendung, z. B. `"page_03"` |
| `sourceImage` | string | Dateiname des leeren Quellbilds in `..._empty/` |
| `imageWidth`, `imageHeight` | number | Maße des Quellbilds in px — Bezugsrahmen für alle Koordinaten |
| `bubbles` | `Bubble[]` | Sprechblasen/Textbereiche dieser Seite |
| `images` | `ImageElement[]` | Frei platzierte, perspektivisch verzerrbare Bilder (z. B. übersetzte Poster) |
| `curvedTexts` | `CurvedTextElement[]` | Freistehende Titel-/Effekttexte entlang einer Kurve (z. B. Lautmalerei) |
| `panels` | `Panel[]` | Gezeichnete Panel-Referenzbereiche (reine Editor-Anmerkung, nie im Export) |
| `schemaVersion` | number | `1` (oder fehlend) = Bubble-Koordinaten sind immer absolut, auch mit gesetztem `panelId`; `2` = ein Bubble mit gesetztem `panelId` ist Kind seines Panels, seine Koordinaten sind relativ zu dessen `origin` (siehe unten). Alte Dateien werden beim ersten Laden automatisch einmalig umgerechnet und auf `2` angehoben (siehe „Migration“ unten) |

## Bubble

Ein Eintrag in `bubbles` ist ein Textbereich mit optional sichtbarer Blasengrafik.

### Geometrie & Grundform

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `id` | string | – | eindeutige ID (uuid) |
| `shape` | `"rect" \| "oval" \| "quad"` | – | Grundform. `quad` = freies perspektivisches Viereck (z. B. Schilder), nutzt `corners` statt x/y/width/height |
| `x`, `y` | number | – | Position der Bounding-Box (oben links), Basiswert für alle Sprachen ohne eigene Form |
| `width`, `height` | number | – | Größe der Bounding-Box, Basiswert |
| `rotation` | number | `0` | Rotation in Grad, um das Zentrum der Box |
| `corners` | `Point[4]` \| undefined | – | **nur bei `shape: "quad"`**: die 4 Ecken (Reihenfolge oben-links/oben-rechts/unten-rechts/unten-links) für die perspektivische Verzerrung. `x/y/width/height` halten bei `quad` weiterhin die Bounding-Box, werden aber fürs Rendern ignoriert |

### Sichtbare Blasengrafik

Standardmäßig zeichnet das Tool **keine** Blasenkontur — es wird davon ausgegangen, dass
die Blase bereits im Quellbild gezeichnet ist. Über `bubbleStyle` kann das Tool selbst eine
Kontur zeichnen (für vergessene oder zu kleine Blasen):

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `bubbleStyle` | `"none" \| "speech" \| "thought" \| "shout" \| "svg"` | `"none"` | `none` = unsichtbar (Standard). `speech` = glatte Sprechblase (abgerundetes Rechteck bzw. Ellipse). `thought` = wolkig-buckelige Gedankenblase. `shout` = gezackte Effektblase. `svg` = eigene, hochgeladene SVG-Kontur (`svgFileName`) |
| `fillColor` | string (CSS-Farbe) | `"#ffffff"` | Füllfarbe der Blase, nur wirksam wenn `bubbleStyle ≠ "none"` |
| `strokeColor` | string (CSS-Farbe) | `"#000000"` | Randfarbe |
| `strokeWidthPx` | number | `6` | Randbreite in Bild-px |
| `svgFileName` | string \| `null` | `null` | Dateiname einer hochgeladenen SVG-Kontur unter `server/data/bubble-svgs` — nur wirksam wenn `bubbleStyle: "svg"` |

### Schweif/Zeiger

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `tail` | `Point \| null` | `null` | Spitze des Schweifs (`point`/`point-detached`) bzw. Zielpunkt der Kette (`chain`). **Lokale, unrotierte Koordinaten relativ zur Box** (0,0 = oben links der Box) — dadurch bewegt sich der Schweif automatisch mit, wenn die Blase verschoben/skaliert/rotiert wird. `null` = kein Schweif |
| `tailAnchor` | `Point \| null` | `null` | Wo der Schweif auf der Blasenkontur ansetzt (ebenfalls lokale Koordinaten). `null` = automatisch ermitteln (nächstgelegener Konturpunkt zu `tail`) — wird gesetzt, sobald der Anker-Griff im Editor gezogen wird |
| `tailWidth` | number | `40` | Breite der Schweifbasis an der Blasenkontur (Bild-px) — nur relevant für `tailStyle: "point"`/`"point-detached"` |
| `tailStyle` | `"point" \| "point-detached" \| "chain"` \| undefined | – (siehe unten) | Wie der Schweif mit dem Blasenkörper verbunden ist. `point` = nahtlos in die Kontur übergehend (klassischer Sprechblasen-/Shout-Schweif). `point-detached` = freistehende Spitze, nicht mit der Kontur verschmolzen. `chain` = Kette aus Segmenten (klassischer Gedankenblasen-Stil, jetzt für jeden Blasenstil wählbar) |
| `tailChainSegmentShape` | `"circle" \| "rect" \| "diamond"` | `"circle"` | Form der einzelnen Kettenglieder, nur bei `tailStyle: "chain"` |
| `tailChainSegments` | number (1–8) | `3` | Anzahl der Kettenglieder |
| `tailChainSpacing` | number | `1` | Abstands-Multiplikator zwischen den Kettengliedern — `1` = gleichmäßig bis zur Spitze verteilt (Standard), `<1` staucht näher an die Blase, `>1` streckt darüber hinaus |
| `tailCurve` | number | `0` | Seitliche Wölbung (Bild-px) der Schweif-Kanten — `0` = gerade, positiv/negativ wölbt nach der einen oder anderen Seite |

`tailStyle` ist auf gespeicherten Daten optional: Fehlt es (ältere Dateien), wird es zur
Laufzeit über `resolveEffectiveTailStyle()` implizit aufgelöst — `"chain"` für
`bubbleStyle: "thought"`, sonst `"point"` — damit alte Layouts unverändert weiter aussehen.

### Textstil (Basiswert für alle Sprachen)

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `fontFamily` | string | `"Anime Ace"` | Schriftname (muss unter `server/data/fonts` registriert sein) |
| `fontSize` | number | `24` | Basis-Schriftgröße in px (wird beim Rendern ggf. automatisch verkleinert, damit der Text in die Box passt) |
| `lineHeight` | number | `1.2` | Zeilenhöhe als Vielfaches der Schriftgröße |
| `align` | `"left" \| "center" \| "right"` | `"center"` | Horizontale Textausrichtung |
| `direction` | `"ltr" \| "rtl" \| "vertical-rl"` | `"ltr"` | Leserichtung. `vertical-rl` = vertikale Spalten von rechts nach links (japanisches Lettering, inkl. Furigana `{漢字\|かんじ}` und automatischem Tate-chū-yoko) |
| `color` | string (CSS-Farbe) | `"#000000"` | Textfarbe (Basiswert; **nicht** direkt, aber über `textGradient` ersetzbar) |
| `textOutline` | `TextOutline`-Objekt | siehe unten | Optionale Textumrandung |
| `textGradient` | `TextGradient`-Objekt | siehe unten | Optionaler Farbverlauf statt Volltonfarbe |

#### `TextOutline`

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `enabled` | boolean | `false` | Umrandung an/aus |
| `color` | string (CSS-Farbe) | `"#000000"` | Umrandungsfarbe |
| `widthPx` | number | `4` | Umrandungsbreite in px, hinter der Füllung gezeichnet (wie `strokeText`+`fillText` übereinander) |

#### `TextGradient`

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `enabled` | boolean | `false` | Farbverlauf an/aus — ersetzt bei `true` die Volltonfarbe `color` |
| `colorStart` | string (CSS-Farbe) | `"#ffffff"` | Startfarbe |
| `colorEnd` | string (CSS-Farbe) | `"#6c8cff"` | Endfarbe |
| `angleDeg` | number | `0` | Verlaufsrichtung: `0` = links→rechts, `90` = oben→unten |

### Text pro Sprache

| Feld | Typ | Bedeutung |
|---|---|---|
| `text` | `Record<Sprachcode, string>` | z. B. `{ "de": "Hallo!", "en": "Hello!", "jp": "こんにちは！" }`. Fehlt ein Sprachcode, gilt die Bubble für diese Sprache als unübersetzt (kein Text gerendert) |

### Sprachabhängige Overrides

Jedes der folgenden `*Override`-Felder ist ein `Record<Sprachcode, Wert>`. Fehlt ein
Sprachcode im Override, gilt der Basiswert oben. Aufgelöst wird das zur Laufzeit über
`resolveBubbleStyle(bubble, sprache)` bzw. `resolveBubbleForm(bubble, sprache)` — dieselbe
Funktion nutzen Vorschau und Export, damit sie nie auseinanderlaufen können.

| Feld | Override für | Werttyp |
|---|---|---|
| `fontSizeOverride` | `fontSize` | number |
| `fontFamilyOverride` | `fontFamily` | string |
| `lineHeightOverride` | `lineHeight` | number |
| `alignOverride` | `align` | `TextAlign` |
| `directionOverride` | `direction` | `TextDirection` |
| `textOutlineOverride` | `textOutline` | `TextOutline`-Objekt |
| `textGradientOverride` | `textGradient` | `TextGradient`-Objekt |
| `formOverride` | **gesamtes Bündel**: `x/y/width/height/rotation` + komplette sichtbare Blasengrafik + Schweif (`bubbleStyle/fillColor/strokeColor/strokeWidthPx/svgFileName/tail/tailAnchor/tailWidth/tailStyle/tailChainSegmentShape/tailChainSegments/tailChainSpacing/tailCurve`) | `BubbleForm`-Objekt (siehe unten) |

`formOverride` ersetzt (anders als die anderen Overrides) nicht nur ein einzelnes Feld,
sondern das komplette Geometrie+Optik+Schweif-Bündel auf einmal — z. B. weil eine deutsche
Übersetzung eine größere, anders positionierte oder anders gestylte Blase braucht als das
japanische Original. Nur für `shape: "rect"`/`"oval"` relevant (nicht für `"quad"`).

```jsonc
// formOverride-Eintrag für Sprache "de":
"formOverride": {
  "de": {
    "x": 180, "y": 120, "width": 820, "height": 460, "rotation": 0,
    "bubbleStyle": "speech", "fillColor": "#ffffff", "strokeColor": "#000000",
    "strokeWidthPx": 6, "svgFileName": null,
    "tail": { "x": 410, "y": 500 }, "tailAnchor": null, "tailWidth": 40,
    "tailStyle": "point", "tailChainSegmentShape": "circle",
    "tailChainSegments": 3, "tailChainSpacing": 1, "tailCurve": 0
  }
}
```

### Zuordnung zu Panel & Charakter

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `panelId` | string \| `null` | `null` | ID eines Eintrags aus `panels` dieser Seite. `null` = keinem Panel zugeordnet, absolute Koordinaten (Standardfall). Ist es gesetzt, ist die Blase **Kind** dieses Panels: `x`/`y`/`corners`/`formOverride[*].x/y` sind relativ zu dessen `origin` (siehe [Panel](#panel) unten) statt absolut. Zuordnung geschieht automatisch beim Panel-Erstellen (Mittelpunkt-in-Polygon-Test, keine bereits zugeordnete Blase wird gestohlen) sowie automatisch beim Trennen, falls die Blase per Drag/Resize aus dem Panel-Umriss herausbewegt wird; nur die Neuzuordnung/Trennung selbst bleibt ein manueller Schritt (Inspector-Dropdown, Rechtsklick-Menü). Verweist die ID auf ein gelöschtes Panel, gilt die Blase als unzugeordnet (ihre Koordinaten sind dann bereits wieder absolut — ein Panel-Löschen entkoppelt seine Kinder statt sie stehen zu lassen) |
| `characterId` | string \| `null` | `null` | ID eines projektweiten Charakters (siehe [Charaktere](#charakter)). `null` = keinem Charakter zugeordnet, ebenso bei gelöschtem Charakter |

`characterId` bleibt rein informativ für die [Berichte](FEATURES.md#berichte) — beeinflusst
weder Rendering noch PNG-Export. `panelId` dagegen wirkt sich seit `schemaVersion: 2` auf die
Koordinaten selbst aus (siehe oben und [Panel](#panel)).

### Lettering-Preset-Verknüpfung

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `presetId` | string \| `null` | `null` | ID eines projektweiten [`LetteringPreset`](#letteringpreset). Jedes vom Preset definierte Feld (Textstil und, nur bei Bubbles, Blasenhintergrund) überschreibt live den entsprechenden Basiswert — außer ein `*Override`/`formOverride` für die aktive Sprache ist gesetzt, der gewinnt immer. `null` oder eine auf ein gelöschtes Preset verweisende ID = keine Verknüpfung, alle Felder nutzen den eigenen Basiswert |

Aufgelöst wird das zusammen mit den Sprach-Overrides in derselben Funktion
(`resolveBubbleStyle(bubble, sprache, presets)` / `resolveBubbleForm(bubble, sprache, presets)`),
Rangfolge: Sprach-Override > Preset-Feld > Basiswert.

### Reading-Order

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `readingOrderOverride` | number \| fehlt | fehlt | Manuelle Korrektur der Leseposition innerhalb der Gruppe der Blase (ihr Panel, oder „Ohne Panel“) — siehe [Reading-Order](FEATURES.md#reading-order). Fehlt das Feld, gilt die automatische Y-Sortierung. Nur relativ zu den anderen Blasen **derselben Gruppe zum Zeitpunkt der letzten manuellen Korrektur** aussagekräftig; wird beim Ändern von `panelId` automatisch verworfen |
| `locked` | boolean \| fehlt | fehlt | Sperrt Position/Form gegen Verschieben, Verformen, Löschen und Duplizieren (per Schloss-Symbol im Editor umschaltbar, siehe [Sperren](FEATURES.md#sperren)). Wird nur gespeichert, wenn zuletzt gesperrt — kein `false`-Wert in der JSON |

## ImageElement

Ein Eintrag in `images` ist ein frei platziertes, perspektivisch verzerrbares Bild (z. B.
ein übersetztes Poster/Schild), unabhängig von Sprechblasen.

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `id` | string | – | eindeutige ID |
| `corners` | `Point[4]` | – | die 4 Ecken (px, Bildkoordinaten) für die perspektivische Verzerrung, wie bei `quad`-Bubbles |
| `opacity` | number (0–1) | `1` | Deckkraft |
| `files` | `Record<Sprachcode, Dateiname>` | `{}` | hochgeladene Bilddatei (unter `server/data/images`) pro Sprache. Fehlt eine Sprache, wird ersatzweise die erste vorhandene Datei angezeigt statt gar nichts (siehe `imageFileForLanguage()`) |
| `locked` | boolean \| fehlt | fehlt | Sperrt Position/Form gegen Verschieben, Verformen, Löschen und Duplizieren — siehe [Sperren](FEATURES.md#sperren). Wird nur gespeichert, wenn zuletzt gesperrt |

## CurvedTextElement

Ein Eintrag in `curvedTexts` ist ein freistehender Titel-/Effekttext, der statt in einer
Blasen-Box entlang einer kubischen Bézierkurve verläuft — z. B. ein logoartiger Kapiteltitel
oder eine Lautmalerei wie „BOOM!“ auf einer Splash-Page. Bewusst einzeilig und ohne
Leserichtungs-/Vertikal-Option (fokussiertes Titel-/Effekt-Werkzeug, kein zweites
Volltext-Layoutsystem).

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `id` | string | – | eindeutige ID |
| `points` | `Point[4]` | – | 4 Kontrollpunkte der kubischen Bézierkurve, absolute Bild-px (gleiche Konvention wie `ImageElement.corners`) |
| `fontFamily` | string | `"Anime Ace"` | Schriftname |
| `fontSize` | number | `48` | Basis-Schriftgröße (schrumpft automatisch passend zur Kurvenlänge) |
| `align` | `"left" \| "center" \| "right"` | `"center"` | Ausrichtung entlang der Kurve (Anfang/Mitte/Ende) |
| `color` | string (CSS-Farbe) | `"#000000"` | Textfarbe |
| `textOutline` | `TextOutline`-Objekt | wie bei Bubble | Optionale Textumrandung |
| `textGradient` | `TextGradient`-Objekt | wie bei Bubble | Optionaler Farbverlauf |
| `text` | `Record<Sprachcode, string>` | `{}` | Text pro Sprache |
| `presetId` | string \| `null` | `null` | ID eines projektweiten [`LetteringPreset`](#letteringpreset) — nur dessen Textstil-Teil wird angewendet, kein Blasenhintergrund. Gleiche Rangfolge/Stale-Referenz-Behandlung wie bei `Bubble.presetId` |
| `locked` | boolean \| fehlt | fehlt | Sperrt Position/Form gegen Verschieben, Verformen, Löschen und Duplizieren — siehe [Sperren](FEATURES.md#sperren). Wird nur gespeichert, wenn zuletzt gesperrt |

### Sprachabhängige Overrides

Gleiches Muster wie bei Bubble, aufgelöst über `resolveCurvedTextStyle(element, sprache, presets)`:

| Feld | Override für | Werttyp |
|---|---|---|
| `fontSizeOverride` | `fontSize` | number |
| `fontFamilyOverride` | `fontFamily` | string |
| `alignOverride` | `align` | `TextAlign` |
| `textOutlineOverride` | `textOutline` | `TextOutline`-Objekt |
| `textGradientOverride` | `textGradient` | `TextGradient`-Objekt |

Kein `formOverride`/`directionOverride`/`lineHeightOverride` — Kurventexte haben weder
Box-Geometrie noch Leserichtung noch mehrere Zeilen.

## Panel

Ein Eintrag in `panels` markiert einen Comic-Panel als gezeichneten Referenzbereich — reine
Editor-Anmerkung (gestrichelte Kontur + Beschriftung in der Vorschau), **nie Teil des
PNG-Exports**. Ein freies Polygon (nicht nur ein Rechteck), da echte Manga-Panels oft
schräg geschnitten oder mehreckig sind: die Form wird durch Ziehen/Hinzufügen/Entfernen
einzelner Eckpunkte verändert, nicht über Rotations-/Skalierungsgriffe.

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `id` | string | – | eindeutige ID |
| `points` | `Point[]` (mind. 3) | – | Eckpunkte des Polygons, Bild-px, in Zeichenreihenfolge |
| `label` | string | `""` | Beschriftung; leer = automatisch „Panel N“ (1-basiert, nach Position im `panels`-Array) — siehe `panelDisplayLabel()` |
| `color` | string (CSS-Farbe) | `"#6c8cff"` | Rahmen-/Beschriftungsfarbe |
| `origin` | `Point` | – | Anker, auf den sich die Koordinaten einer Kind-Blase (`Bubble.panelId === id`) beziehen — die Bounding-Box-oben-links-Ecke des Polygons **zum Zeitpunkt der Erstellung**, danach **nicht** mehr live aus `points` neu berechnet. Wird nur mitverschoben, wenn das ganze Panel als Starrkörper bewegt wird (Fläche ziehen, Nudge, Duplizieren) — ein einzelner Eckpunkt-Reshape lässt `origin` unangetastet, damit Kind-Blasen beim reinen Umformen der Kontur nicht mitspringen |
| `locked` | boolean \| fehlt | fehlt | Sperrt Position/Form gegen Verschieben, Verformen, Löschen und Duplizieren — siehe [Sperren](FEATURES.md#sperren). Wird nur gespeichert, wenn zuletzt gesperrt |
| `cut` | Objekt \| fehlt | fehlt | Nur gesetzt, wenn dieses Panel ein „Cut-Panel“ ist — siehe [Cut-Panel](FEATURES.md#cut-panel). `{ cutOrigin: Point, holeFill: { mode: "auto" \| "manual", color: string } }`. `cutOrigin` ist `origin`s Wert zum Zeitpunkt des Ausschneidens, danach nie mehr verändert — die Differenz zum aktuellen `origin` plus die aktuellen `points` legen jederzeit fest, welcher Bereich der `_empty`-Quelldatei hier gezeigt wird (siehe `cutPanelDelta()` in `client/src/export/cutPanel.ts`). `holeFill.color` ist immer ein konkreter Hex-Wert, auch im „auto“-Modus (einmalig beim Ausschneiden aus der Umgebung abgetastet) |

Im Editor: die ganze Fläche ziehen verschiebt das Panel (und trägt seine Kind-Blasen mit),
ein einzelner Eckpunkt verformt nur die Kontur (Kind-Blasen bleiben unbewegt), Doppelklick
auf die Kontur fügt dort einen neuen Punkt ein, Rechtsklick auf einen Punkt entfernt ihn
(mindestens 3 Punkte bleiben immer erhalten). Ein neu gezeichnetes Panel startet als
Rechteck (4 Eckpunkte), ist danach aber ein Polygon wie jedes andere.

**Bubbles als Kinder eines Panels**: eine Blase wird beim Erstellen eines neuen Panels
automatisch dessen Kind, wenn ihr Mittelpunkt im neuen Polygon liegt und sie noch keinem
anderen Panel zugeordnet ist (kein „Stehlen“). Wird eine Kind-Blase per Drag/Resize so
bewegt, dass ihr Mittelpunkt den Panel-Umriss verlässt, wird sie automatisch wieder
eigenständig (zurück auf absolute Koordinaten, `panelId: null`) — ausgelöst nur bei echter
Geometrie-Änderung, nicht bei reinen Text-/Stil-Änderungen. Eine manuelle
(Neu-)Zuordnung/Trennung bleibt weiterhin über das Panel-Dropdown im Inspector bzw. das
Rechtsklick-Menü möglich. Wird ein Panel gelöscht, werden seine Kind-Blasen nicht
mitgelöscht, sondern entkoppelt (zurück auf absolute Koordinaten, `panelId: null`) —
konsistent mit dem „stale Referenz = unzugeordnet“-Prinzip bei gelöschten
Charakteren/Presets.

**Migration alter Rechteck-Panels**: Seiten, die noch ein Panel im alten Format
(`x`/`y`/`width`/`height`/`rotation`) enthalten, werden beim Einlesen automatisch in ein
gleichwertiges 4-Eckpunkte-Polygon umgerechnet (inklusive vorhandener Rotation) — das
Panel sieht unverändert aus, ist danach aber sofort frei verformbar. Diese Umwandlung
passiert nur beim Parsen (`PanelSchema`), nicht dauerhaft auf der Festplatte — erst ein
erneutes Speichern schreibt das neue Format zurück. Fehlt `origin` (jedes Panel vor dieser
Funktion), wird es genauso beim Parsen aus den (ggf. gerade migrierten) `points` abgeleitet.

**Migration auf `schemaVersion: 2`**: Seiten mit bereits vorhandenen `panelId`-Zuordnungen
aus der Zeit vor dieser Funktion hatten immer absolute Blasen-Koordinaten. Damit sie unter
der neuen Bedeutung nicht plötzlich falsch (relativ statt absolut) interpretiert werden,
rechnet ein einmaliges Preprocessing beim ersten Laden (`PageLayoutSchema`, ausgelöst wenn
`schemaVersion` fehlt oder `< 2` ist) für jede Blase mit gültigem `panelId` ihre bisherigen
absoluten Koordinaten (`x`/`y`/`corners`/`formOverride[*].x/y`) auf panel-relative um und
setzt danach `schemaVersion: 2` — optisch bleibt alles exakt an Ort und Stelle. Erst ein
erneutes Speichern schreibt `schemaVersion: 2` dauerhaft auf die Festplatte.

## LetteringPreset

Presets sind **nicht** Teil der Seiten-Layout-JSON, sondern projektweit in der Projektdatei
gespeichert (`presets`-Feld, analog zu `characters`/`glossary`) — siehe
[Lettering-Presets](FEATURES.md#lettering-presets). Jedes Feld ist einzeln optional
(„sparse“): fehlt ein Feld, definiert das Preset diesen Aspekt bewusst nicht, und jede
verknüpfte Bubble/jeder Kurventext behält dafür ihren/seinen eigenen Basiswert.

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | eindeutige ID |
| `name` | string | Anzeigename, z. B. „SFX Style“ — freier Text, keine feste Kategorie |
| `text` | `PresetTextFields`-Objekt | siehe unten |
| `background` | `PresetBackgroundFields`-Objekt | siehe unten, nur für Bubbles relevant |

### `PresetTextFields` (alle Felder optional)

| Feld | Werttyp |
|---|---|
| `fontFamily` | string |
| `fontSize` | number |
| `lineHeight` | number |
| `align` | `TextAlign` |
| `direction` | `TextDirection` |
| `color` | string (CSS-Farbe) |
| `textOutline` | `TextOutline`-Objekt |
| `textGradient` | `TextGradient`-Objekt |

### `PresetBackgroundFields` (alle Felder optional, nur für Bubbles)

| Feld | Werttyp |
|---|---|
| `bubbleStyle` | `"none" \| "speech" \| "thought" \| "shout" \| "svg"` |
| `fillColor` | string (CSS-Farbe) |
| `strokeColor` | string (CSS-Farbe) |
| `strokeWidthPx` | number |
| `svgFileName` | string \| `null` |
| `tailStyle` | `"point" \| "point-detached" \| "chain"` |
| `tailChainSegmentShape` | `"circle" \| "rect" \| "diamond"` |
| `tailChainSegments` | number (1–8) |
| `tailChainSpacing` | number |

Bewusst **kein** `x/y/width/height/rotation`/`tail`/`tailAnchor`/`tailWidth`/`tailCurve` —
das sind Instanz-Eigenschaften einer einzelnen Blase, kein Preset-Feld.

## ProjectMember

Wie `presets`/`characters`/`glossary` ist auch `members` ein Feld der Projektdatei
selbst (nicht der Seiten-Layout-JSON) — siehe
[Konten, Rollen & Zugriffsschutz](FEATURES.md#konten-rollen--zugriffsschutz). Zieht
portabel mit der Projektdatei um.

| Feld | Typ | Bedeutung |
|---|---|---|
| `userId` | string | ID eines serverweiten Accounts (siehe `users.json` im Server-Datenordner, nicht Teil der Projektdatei) |
| `role` | `"viewer" \| "translator" \| "letterer" \| "admin"` | Rolle dieses Accounts in genau diesem Projekt |

Ein Account mit `isSystemAdmin: true` (serverweites Konto-Flag) braucht hier keinen
Eintrag — er hat unabhängig von dieser Liste vollen Admin-Zugriff auf jedes Projekt.

## Hilfstypen

```ts
type Point = { x: number; y: number };
```

## Vollständiges Beispiel

```json
{
  "page": "page_03",
  "sourceImage": "page_03.png",
  "imageWidth": 1476,
  "imageHeight": 2079,
  "bubbles": [
    {
      "id": "79e27218-1c16-443f-8ec8-67e69e0da9d6",
      "shape": "oval",
      "x": 208.39,
      "y": 150.92,
      "width": 690.76,
      "height": 397.23,
      "rotation": -4.89,
      "bubbleStyle": "none",
      "fillColor": "#ffffff",
      "strokeColor": "#000000",
      "strokeWidthPx": 6,
      "svgFileName": null,
      "tail": null,
      "tailAnchor": null,
      "tailWidth": 40,
      "tailStyle": "point",
      "tailChainSegmentShape": "circle",
      "tailChainSegments": 3,
      "tailChainSpacing": 1,
      "tailCurve": 0,
      "fontFamily": "PermanentMarker-Regular",
      "fontSize": 65,
      "lineHeight": 0.9,
      "align": "center",
      "direction": "ltr",
      "color": "#000000",
      "textOutline": { "enabled": false, "color": "#000000", "widthPx": 4 },
      "textGradient": { "enabled": false, "colorStart": "#ffffff", "colorEnd": "#6c8cff", "angleDeg": 0 },
      "text": {
        "de": "Scheißßße\niiiich komme\nzu späääät!!",
        "jp": "やっべえええええ！ 遅刻するぅぅぅぅぅ！！"
      },
      "fontSizeOverride": { "jp": 61, "de": 89 },
      "panelId": null,
      "characterId": "a3524ab4-2c0a-460c-a189-b0b043bf8bfd"
    }
  ],
  "images": [],
  "curvedTexts": [],
  "panels": [
    {
      "id": "55765786-9420-4829-ba16-53a0876b0da5",
      "points": [
        { "x": 60, "y": 40 },
        { "x": 360, "y": 40 },
        { "x": 360, "y": 260 },
        { "x": 60, "y": 260 }
      ],
      "label": "", "color": "#6c8cff"
    }
  ]
}
```

## Wichtige Invarianten

- **Rückwärtskompatibel per Design:** Alle neueren Felder (`bubbleStyle`, `fillColor`,
  `strokeColor`, `strokeWidthPx`, `svgFileName`, `tail`, `tailAnchor`, `tailWidth`,
  `tailStyle` + Ketten-Felder, `tailCurve`, `textOutline`, `textGradient`, `formOverride`,
  alle `*Override`-Felder, `panelId`, `characterId`, `readingOrderOverride`, `presetId`,
  `locked`, `cut`, sowie die Arrays `curvedTexts` und
  `panels` selbst) sind in Zod mit `.default(...)` bzw. `.optional()` deklariert. Ältere
  JSON-Dateien ohne diese Felder werden beim Einlesen automatisch mit den Defaultwerten
  aufgefüllt — keine Migration nötig. Panels haben zusätzlich eine echte
  Formatmigration (siehe oben): das alte `x/y/width/height/rotation`-Format wird beim
  Parsen in `points` umgerechnet, nicht nur mit Defaults aufgefüllt.
- **`bubbleStyle: "none"` (Default) ist unsichtbar** und ändert am gerenderten Bild nichts
  gegenüber dem reinen Text-Overlay von früher.
- Overrides greifen nur, wenn der jeweilige Sprachcode als Schlüssel vorhanden ist — ein
  leeres Objekt `{}` bzw. ein fehlendes Feld bedeutet „kein Override, nutze Basiswert“.
- **`panels` sind reine Editor-Daten** — `renderPageToPng.ts` liest dieses Array nicht,
  Panels erscheinen also nie im exportierten Bild.
- **Stale-Referenzen sind kein Fehler**: Ein `panelId`/`characterId`/`presetId`, das auf
  ein inzwischen gelöschtes Panel/Charakter/Preset verweist, bleibt als Wert in der JSON
  stehen (wird nicht automatisch bereinigt), gilt aber überall (Inspector-Dropdowns,
  Berichte, Stil-Auflösung) als „unzugeordnet“ bzw. fällt auf den eigenen Basiswert
  zurück.
