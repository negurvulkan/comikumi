# Page Layout JSON Format

*[Deutsche Version](JSON-Format.de.md)*

Each page has exactly one JSON file (`<volume>_lettering/page_XX.json`) describing its
complete lettering layout: speech bubbles, placed images, curved texts, panel markers,
and their translations for all languages. This file is the single source of truth —
both the live preview in the editor and the PNG export read exclusively from it. The
schema is defined in `shared/src/layoutSchema.ts` as a [Zod](https://zod.dev) schema; this
file describes it in prose.

All coordinates/dimensions (`x`, `y`, `width`, `height`, `strokeWidthPx`, points in `corners`/
`points` etc.) are **pixels in the coordinate system of the source image** (`imageWidth` ×
`imageHeight`), not screen or zoom pixels.

## Basic structure (`PageLayout`)

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

| Field | Type | Meaning |
|---|---|---|
| `page` | string | Page name without file extension, e.g. `"page_03"` |
| `sourceImage` | string | File name of the blank source image in `..._empty/` |
| `imageWidth`, `imageHeight` | number | Dimensions of the source image in px — reference frame for all coordinates |
| `bubbles` | `Bubble[]` | Speech bubbles/text areas on this page |
| `images` | `ImageElement[]` | Freely placed, perspective-distortable images (e.g. translated posters) |
| `curvedTexts` | `CurvedTextElement[]` | Standalone title/effect texts along a curve (e.g. onomatopoeia) |
| `panels` | `Panel[]` | Drawn panel reference areas (editor annotation only, never in the export) |
| `schemaVersion` | number | `1` (or missing) = bubble coordinates are always absolute, even with `panelId` set; `2` = a bubble with `panelId` set is a child of its panel, its coordinates are relative to its `origin` (see below). Older files are automatically converted once on first load and bumped to `2` (see "Migration" below) |

## Bubble

An entry in `bubbles` is a text area with an optional visible bubble graphic.

### Geometry & basic shape

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | – | unique ID (uuid) |
| `shape` | `"rect" \| "oval" \| "quad"` | – | Basic shape. `quad` = free perspective quadrilateral (e.g. signs), uses `corners` instead of x/y/width/height |
| `x`, `y` | number | – | Position of the bounding box (top left), base value for all languages without their own shape |
| `width`, `height` | number | – | Size of the bounding box, base value |
| `rotation` | number | `0` | Rotation in degrees, around the center of the box |
| `corners` | `Point[4]` \| undefined | – | **only for `shape: "quad"`**: the 4 corners (order top-left/top-right/bottom-right/bottom-left) for the perspective distortion. For `quad`, `x/y/width/height` still hold the bounding box but are ignored for rendering |

### Visible bubble graphic

By default the tool draws **no** bubble outline — it is assumed the bubble is already
drawn in the source image. Via `bubbleStyle` the tool can draw an outline itself (for
forgotten or too-small bubbles):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `bubbleStyle` | `"none" \| "speech" \| "thought" \| "shout" \| "svg"` | `"none"` | `none` = invisible (default). `speech` = smooth speech bubble (rounded rectangle or ellipse). `thought` = cloud-shaped, bumpy thought bubble. `shout` = jagged effect bubble. `svg` = custom, uploaded SVG outline (`svgFileName`) |
| `fillColor` | string (CSS color) | `"#ffffff"` | Fill color of the bubble, only effective when `bubbleStyle ≠ "none"` |
| `strokeColor` | string (CSS color) | `"#000000"` | Outline color |
| `strokeWidthPx` | number | `6` | Outline width in image px |
| `svgFileName` | string \| `null` | `null` | File name of an uploaded SVG outline under `server/data/bubble-svgs` — only effective when `bubbleStyle: "svg"` |

### Tail/pointer

| Field | Type | Default | Meaning |
|---|---|---|---|
| `tail` | `Point \| null` | `null` | Tip of the tail (`point`/`point-detached`) or target point of the chain (`chain`). **Local, unrotated coordinates relative to the box** (0,0 = top left of the box) — this way the tail automatically moves along when the bubble is moved/scaled/rotated. `null` = no tail |
| `tailAnchor` | `Point \| null` | `null` | Where the tail attaches to the bubble outline (also local coordinates). `null` = determine automatically (nearest outline point to `tail`) — is set as soon as the anchor handle is dragged in the editor |
| `tailWidth` | number | `40` | Width of the tail base at the bubble outline (image px) — only relevant for `tailStyle: "point"`/`"point-detached"` |
| `tailStyle` | `"point" \| "point-detached" \| "chain"` \| undefined | – (see below) | How the tail connects to the bubble body. `point` = seamlessly merging into the outline (classic speech-bubble/shout tail). `point-detached` = standalone tip, not merged with the outline. `chain` = chain of segments (classic thought-bubble style, now selectable for every bubble style) |
| `tailChainSegmentShape` | `"circle" \| "rect" \| "diamond"` | `"circle"` | Shape of the individual chain links, only for `tailStyle: "chain"` |
| `tailChainSegments` | number (1–8) | `3` | Number of chain links |
| `tailChainSpacing` | number | `1` | Spacing multiplier between chain links — `1` = evenly distributed up to the tip (default), `<1` compresses closer to the bubble, `>1` stretches beyond it |
| `tailCurve` | number | `0` | Lateral bulge (image px) of the tail edges — `0` = straight, positive/negative bulges to one side or the other |

`tailStyle` is optional on saved data: if it's missing (older files), it is implicitly
resolved at runtime via `resolveEffectiveTailStyle()` — `"chain"` for
`bubbleStyle: "thought"`, otherwise `"point"` — so old layouts keep looking unchanged.

### Text style (base value for all languages)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `fontFamily` | string | `"Anime Ace"` | Font name (must be registered under `server/data/fonts`) |
| `fontSize` | number | `24` | Base font size in px (automatically shrunk during rendering if needed so the text fits in the box) |
| `lineHeight` | number | `1.2` | Line height as a multiple of the font size |
| `align` | `"left" \| "center" \| "right"` | `"center"` | Horizontal text alignment |
| `direction` | `"ltr" \| "rtl" \| "vertical-rl"` | `"ltr"` | Reading direction. `vertical-rl` = vertical columns right-to-left (Japanese lettering, including furigana `{漢字\|かんじ}` and automatic tate-chū-yoko) |
| `color` | string (CSS color) | `"#000000"` | Text color (base value; **not** directly, but replaceable via `textGradient`) |
| `textOutline` | `TextOutline` object | see below | Optional text outline |
| `textGradient` | `TextGradient` object | see below | Optional gradient instead of solid color |

#### `TextOutline`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Outline on/off |
| `color` | string (CSS color) | `"#000000"` | Outline color |
| `widthPx` | number | `4` | Outline width in px, drawn behind the fill (like `strokeText`+`fillText` stacked) |

#### `TextGradient`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Gradient on/off — when `true` replaces the solid `color` |
| `colorStart` | string (CSS color) | `"#ffffff"` | Start color |
| `colorEnd` | string (CSS color) | `"#6c8cff"` | End color |
| `angleDeg` | number | `0` | Gradient direction: `0` = left→right, `90` = top→bottom |

### Text per language

| Field | Type | Meaning |
|---|---|---|
| `text` | `Record<LanguageCode, string>` | e.g. `{ "de": "Hallo!", "en": "Hello!", "jp": "こんにちは！" }`. If a language code is missing, the bubble is considered untranslated for that language (no text rendered) |

### Language-dependent overrides

Each of the following `*Override` fields is a `Record<LanguageCode, value>`. If a
language code is missing from the override, the base value above applies. This is
resolved at runtime via `resolveBubbleStyle(bubble, language)` and
`resolveBubbleForm(bubble, language)` respectively — the preview and the export use the
same function, so they can never diverge.

| Field | Override for | Value type |
|---|---|---|
| `fontSizeOverride` | `fontSize` | number |
| `fontFamilyOverride` | `fontFamily` | string |
| `lineHeightOverride` | `lineHeight` | number |
| `alignOverride` | `align` | `TextAlign` |
| `directionOverride` | `direction` | `TextDirection` |
| `textOutlineOverride` | `textOutline` | `TextOutline` object |
| `textGradientOverride` | `textGradient` | `TextGradient` object |
| `formOverride` | **entire bundle**: `x/y/width/height/rotation` + complete visible bubble graphic + tail (`bubbleStyle/fillColor/strokeColor/strokeWidthPx/svgFileName/tail/tailAnchor/tailWidth/tailStyle/tailChainSegmentShape/tailChainSegments/tailChainSpacing/tailCurve`) | `BubbleForm` object (see below) |

`formOverride` — unlike the other overrides — replaces not just a single field but the
entire geometry+visuals+tail bundle at once — e.g. because a German translation needs a
bigger, differently positioned, or differently styled bubble than the Japanese original.
Only relevant for `shape: "rect"`/`"oval"` (not for `"quad"`).

```jsonc
// formOverride entry for language "de":
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

### Panel & character assignment

| Field | Type | Default | Meaning |
|---|---|---|---|
| `panelId` | string \| `null` | `null` | ID of an entry from this page's `panels`. `null` = not assigned to a panel, absolute coordinates (default case). If set, the bubble is a **child** of this panel: `x`/`y`/`corners`/`formOverride[*].x/y` are relative to its `origin` (see [Panel](#panel) below) instead of absolute. Assignment happens automatically on panel creation (center-in-polygon test, an already-assigned bubble is never stolen) and automatically on detachment if the bubble is moved out of the panel outline via drag/resize; only the (re-)assignment/detachment itself remains a manual step (inspector dropdown, right-click menu). If the ID refers to a deleted panel, the bubble is considered unassigned (its coordinates are then already absolute again — deleting a panel decouples its children instead of leaving them stranded) |
| `characterId` | string \| `null` | `null` | ID of a project-wide character (see [Character Management](FEATURES.md#character-management)). `null` = not assigned to a character, likewise if the character has been deleted |

`characterId` remains purely informational for the [Reports](FEATURES.md#reports) — it
affects neither rendering nor the PNG export. `panelId`, on the other hand, has affected
the coordinates themselves since `schemaVersion: 2` (see above and [Panel](#panel)).

### Lettering preset link

| Field | Type | Default | Meaning |
|---|---|---|---|
| `presetId` | string \| `null` | `null` | ID of a project-wide [`LetteringPreset`](#letteringpreset). Every field defined by the preset (text style, and, for bubbles only, bubble background) live-overrides the corresponding base value — unless a `*Override`/`formOverride` for the active language is set, which always wins. `null` or an ID pointing to a deleted preset = no link, all fields use their own base value |

This is resolved together with the language overrides in the same function
(`resolveBubbleStyle(bubble, language, presets)` / `resolveBubbleForm(bubble, language, presets)`),
precedence: language override > preset field > base value.

### Reading order

| Field | Type | Default | Meaning |
|---|---|---|---|
| `readingOrderOverride` | number \| missing | missing | Manual correction of the reading position within the bubble's group (its panel, or "no panel") — see [Reading Order](FEATURES.md#reading-order). If the field is missing, automatic Y sorting applies. Only meaningful relative to the other bubbles **in the same group at the time of the last manual correction**; automatically discarded when `panelId` changes |
| `locked` | boolean \| missing | missing | Locks position/shape against moving, resizing, deleting, and duplicating (toggleable via the lock icon in the editor, see [Locking](FEATURES.md#locking)). Only saved when last locked — no `false` value in the JSON |

## ImageElement

An entry in `images` is a freely placed, perspective-distortable image (e.g. a
translated poster/sign), independent of speech bubbles.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | – | unique ID |
| `corners` | `Point[4]` | – | the 4 corners (px, image coordinates) for the perspective distortion, as with `quad` bubbles |
| `opacity` | number (0–1) | `1` | Opacity |
| `files` | `Record<LanguageCode, filename>` | `{}` | uploaded image file (under `server/data/images`) per language. If a language is missing, the first available file is shown as a fallback instead of nothing (see `imageFileForLanguage()`) |
| `locked` | boolean \| missing | missing | Locks position/shape against moving, resizing, deleting, and duplicating — see [Locking](FEATURES.md#locking). Only saved when last locked |

## CurvedTextElement

An entry in `curvedTexts` is a standalone title/effect text that runs along a cubic
Bézier curve instead of inside a bubble box — e.g. a logo-like chapter title or
onomatopoeia like "BOOM!" on a splash page. Deliberately single-line and without a
reading-direction/vertical option (a focused title/effect tool, not a second full-text
layout system).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | – | unique ID |
| `points` | `Point[4]` | – | 4 control points of the cubic Bézier curve, absolute image px (same convention as `ImageElement.corners`) |
| `fontFamily` | string | `"Anime Ace"` | Font name |
| `fontSize` | number | `48` | Base font size (automatically shrinks to fit the curve length) |
| `align` | `"left" \| "center" \| "right"` | `"center"` | Alignment along the curve (start/middle/end) |
| `color` | string (CSS color) | `"#000000"` | Text color |
| `textOutline` | `TextOutline` object | as for Bubble | Optional text outline |
| `textGradient` | `TextGradient` object | as for Bubble | Optional gradient |
| `text` | `Record<LanguageCode, string>` | `{}` | Text per language |
| `presetId` | string \| `null` | `null` | ID of a project-wide [`LetteringPreset`](#letteringpreset) — only its text-style part is applied, no bubble background. Same precedence/stale-reference handling as `Bubble.presetId` |
| `locked` | boolean \| missing | missing | Locks position/shape against moving, resizing, deleting, and duplicating — see [Locking](FEATURES.md#locking). Only saved when last locked |

### Language-dependent overrides

Same pattern as Bubble, resolved via `resolveCurvedTextStyle(element, language, presets)`:

| Field | Override for | Value type |
|---|---|---|
| `fontSizeOverride` | `fontSize` | number |
| `fontFamilyOverride` | `fontFamily` | string |
| `alignOverride` | `align` | `TextAlign` |
| `textOutlineOverride` | `textOutline` | `TextOutline` object |
| `textGradientOverride` | `textGradient` | `TextGradient` object |

No `formOverride`/`directionOverride`/`lineHeightOverride` — curved texts have neither
box geometry, nor reading direction, nor multiple lines.

## Panel

An entry in `panels` marks a comic panel as a drawn reference area — editor annotation
only (dashed outline + label in the preview), **never part of the PNG export**. A free
polygon (not just a rectangle), since real manga panels are often cut at an angle or
have many sides: the shape is changed by dragging/adding/removing individual corner
points, not via rotation/scale handles.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | – | unique ID |
| `points` | `Point[]` (at least 3) | – | Corner points of the polygon, image px, in drawing order |
| `label` | string | `""` | Label; empty = automatic "Panel N" (1-based, by position in the `panels` array) — see `panelDisplayLabel()` |
| `color` | string (CSS color) | `"#6c8cff"` | Border/label color |
| `origin` | `Point` | – | Anchor that a child bubble's (`Bubble.panelId === id`) coordinates are relative to — the top-left bounding-box corner of the polygon **at the time of creation**, after which it is **not** recomputed live from `points`. Only moves along when the whole panel is moved as a rigid body (dragging the area, nudging, duplicating) — reshaping a single corner point leaves `origin` untouched, so child bubbles don't jump when the outline alone is reshaped |
| `locked` | boolean \| missing | missing | Locks position/shape against moving, resizing, deleting, and duplicating — see [Locking](FEATURES.md#locking). Only saved when last locked |
| `cut` | object \| missing | missing | Only set when this panel is a "cut panel" — see [Cut Panel](FEATURES.md#cut-panel). `{ cutOrigin: Point, holeFill: { mode: "auto" \| "manual", color: string }, removed?: boolean, replacement?: { files: Record<LanguageCode, filename>, border?: { color: string, widthPx: number } } }`. `cutOrigin` is the value of `origin` at the time of cutting, never changed afterward — the difference to the current `origin` plus the current `points` determine at any time which area of the `_empty` source file is shown here (see `cutPanelDelta()` in `client/src/export/cutPanel.ts`). `holeFill.color` is always a concrete hex value, even in "auto" mode (sampled once from the surroundings at the time of cutting). `removed: true` only covers up the content at the original location but doesn't redraw it anywhere — the panel is then semantically considered no longer present for script/reports/reading order (`groupBubblesByPanel()`/`charactersByPanel()` in `reportUtils.ts`), but remains structurally unchanged (geometry, child bubbles) and reversible at any time. `replacement` instead shows an uploaded replacement image (same language-code→filename convention as `ImageElement.files`/`imageFileForLanguage()`, see `cutPanelReplacementFileForLanguage()`) — stretched to the bounding box of the current polygon and clipped to its actual shape (no 4-point perspective distortion, since a panel polygon can have any number of corner points). `replacement.border`, if set, is — unlike `Panel.color` — actually drawn into the PNG export. `removed` always wins if both were set at the same time. Each sub-field is only saved when last set |
| `languageOverride` | `Record<LanguageCode, { points: Point[], origin: Point, cut?: object }>` \| missing | missing | Language-dependent cut behavior — see [Cut Panel](FEATURES.md#cut-panel). Same "entire bundle replaces base" pattern as `Bubble.formOverride`: a language entry completely replaces `points`+`origin`+`cut` for that language; if missing, the base applies (see `resolvePanelForLanguage()`). This lets the same panel, for example, be an unmodified pure reference marker in "ja" (base without `cut`), while being moved/removed/replaced in "de"/"en" (override with its own `cut`). Does **not** affect `Bubble.panelId` coordinates — child bubbles always stay relative to the **base** `origin`, regardless of which language is currently active |

In the editor: dragging the whole area moves the panel (and carries its child bubbles
along), a single corner point only reshapes the outline (child bubbles stay put),
double-clicking the outline inserts a new point there, right-clicking a point removes it
(at least 3 points are always kept). A newly drawn panel starts as a rectangle (4 corner
points) but is afterward a polygon like any other.

**Bubbles as children of a panel**: a bubble automatically becomes a new panel's child
when it's created if its center lies within the new polygon and it isn't already
assigned to another panel (no "stealing"). If a child bubble is moved via drag/resize so
that its center leaves the panel outline, it automatically becomes independent again
(back to absolute coordinates, `panelId: null`) — triggered only by actual geometry
changes, not by pure text/style changes. Manual (re-)assignment/detachment remains
possible via the panel dropdown in the inspector or the right-click menu. When a panel
is deleted, its child bubbles are not deleted along with it but decoupled (back to
absolute coordinates, `panelId: null`) — consistent with the "stale reference =
unassigned" principle for deleted characters/presets.

**Migration of old rectangle panels**: pages that still contain a panel in the old
format (`x`/`y`/`width`/`height`/`rotation`) are automatically converted into an
equivalent 4-corner-point polygon on read (including any existing rotation) — the panel
looks unchanged but is then immediately freely reshapeable. This conversion only happens
during parsing (`PanelSchema`), not permanently on disk — only a subsequent save writes
the new format back. If `origin` is missing (every panel from before this feature), it
is likewise derived during parsing from the (possibly just-migrated) `points`.

**Migration to `schemaVersion: 2`**: pages with existing `panelId` assignments from
before this feature always had absolute bubble coordinates. So that they aren't
suddenly misinterpreted (relative instead of absolute) under the new meaning, a one-time
preprocessing step on first load (`PageLayoutSchema`, triggered when `schemaVersion` is
missing or `< 2`) converts, for every bubble with a valid `panelId`, its previous
absolute coordinates (`x`/`y`/`corners`/`formOverride[*].x/y`) to panel-relative ones and
then sets `schemaVersion: 2` — visually everything stays exactly in place. Only a
subsequent save permanently writes `schemaVersion: 2` to disk.

## LetteringPreset

Presets are **not** part of the page layout JSON but stored project-wide in the project
file (`presets` field, analogous to `characters`/`glossary`) — see
[Lettering Presets](FEATURES.md#lettering-presets). Every field is individually optional
("sparse"): if a field is missing, the preset deliberately does not define that aspect,
and every linked bubble/curved text keeps its own base value for it.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | unique ID |
| `name` | string | Display name, e.g. "SFX Style" — free text, no fixed category |
| `text` | `PresetTextFields` object | see below |
| `background` | `PresetBackgroundFields` object | see below, only relevant for bubbles |

### `PresetTextFields` (all fields optional)

| Field | Value type |
|---|---|
| `fontFamily` | string |
| `fontSize` | number |
| `lineHeight` | number |
| `align` | `TextAlign` |
| `direction` | `TextDirection` |
| `color` | string (CSS color) |
| `textOutline` | `TextOutline` object |
| `textGradient` | `TextGradient` object |

### `PresetBackgroundFields` (all fields optional, bubbles only)

| Field | Value type |
|---|---|
| `bubbleStyle` | `"none" \| "speech" \| "thought" \| "shout" \| "svg"` |
| `fillColor` | string (CSS color) |
| `strokeColor` | string (CSS color) |
| `strokeWidthPx` | number |
| `svgFileName` | string \| `null` |
| `tailStyle` | `"point" \| "point-detached" \| "chain"` |
| `tailChainSegmentShape` | `"circle" \| "rect" \| "diamond"` |
| `tailChainSegments` | number (1–8) |
| `tailChainSpacing` | number |

Deliberately **no** `x/y/width/height/rotation`/`tail`/`tailAnchor`/`tailWidth`/`tailCurve`
— those are instance properties of an individual bubble, not a preset field.

## ProjectMember

Like `presets`/`characters`/`glossary`, `members` is also a field of the project file
itself (not the page layout JSON) — see
[Accounts, Roles & Access Control](FEATURES.md#accounts-roles--access-control). Moves
portably with the project file.

| Field | Type | Meaning |
|---|---|---|
| `userId` | string | ID of a server-wide account (see `users.json` in the server data folder, not part of the project file) |
| `role` | `"viewer" \| "translator" \| "letterer" \| "admin"` | This account's role in exactly this project |

An account with `isSystemAdmin: true` (server-wide account flag) doesn't need an entry
here — it has full admin access to every project regardless of this list.

## Helper types

```ts
type Point = { x: number; y: number };
```

## Complete example

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

## Important invariants

- **Backward compatible by design:** All newer fields (`bubbleStyle`, `fillColor`,
  `strokeColor`, `strokeWidthPx`, `svgFileName`, `tail`, `tailAnchor`, `tailWidth`,
  `tailStyle` + chain fields, `tailCurve`, `textOutline`, `textGradient`, `formOverride`,
  all `*Override` fields, `panelId`, `characterId`, `readingOrderOverride`, `presetId`,
  `locked`, `cut`, `languageOverride`, as well as the `curvedTexts` and
  `panels` arrays themselves) are declared in Zod with `.default(...)` or `.optional()`.
  Older JSON files without these fields are automatically filled in with default values
  on read — no migration needed. Panels additionally have a real format migration
  (see above): the old `x/y/width/height/rotation` format is converted to `points`
  during parsing, not just filled in with defaults.
- **`bubbleStyle: "none"` (default) is invisible** and changes nothing in the rendered
  image compared to the plain text overlay of before.
- Overrides only take effect if the respective language code is present as a key — an
  empty object `{}` or a missing field means "no override, use base value".
- **`panels` are pure editor data** — `renderPageToPng.ts` does not read this array, so
  panels never appear in the exported image.
- **Stale references are not an error**: a `panelId`/`characterId`/`presetId` that points
  to a panel/character/preset that has since been deleted remains as a value in the JSON
  (not automatically cleaned up), but is everywhere (inspector dropdowns, reports,
  style resolution) treated as "unassigned" or falls back to its own base value.
