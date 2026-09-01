# Feature List

*[Deutsche Version](FEATURES.de.md)*

Complete overview of all ComiKumi features, as of the current code. This file is a
snapshot — please keep it in sync with larger changes.

## Contents

- [Project Management](#project-management)
- [Accounts, Roles & Access Control](#accounts-roles--access-control)
- [Multi-User Operation](#multi-user-operation)
- [UI Language](#ui-language)
- [Volumes & Pages](#volumes--pages)
- [Chapters](#chapters)
- [Language Management](#language-management)
- [Character Management](#character-management)
- [Story Bible](#story-bible)
- [Lettering Presets](#lettering-presets)
- [Project Asset Folder](#project-asset-folder)
- [Editor — Canvas Basics](#editor--canvas-basics)
- [Element Types](#element-types)
- [Auto-Bubbles (Detection & OCR)](#auto-bubbles-detection--ocr)
- [Locking](#locking)
- [Cut Panel](#cut-panel)
- [Text List](#text-list)
- [Reading Order](#reading-order)
- [Glossary](#glossary)
- [Context View](#context-view)
- [AI Assistant](#ai-assistant)
- [Script Editor & Script Sidebar](#script-editor--script-sidebar)
- [Review Comments](#review-comments)
- [Read/Review Interface](#readreview-interface)
- [Reports](#reports)
- [Export & Import](#export--import)
- [Fonts](#fonts)
- [Undo/Redo](#undoredo)
- [Server API](#server-api)
- [Error Handling & Security](#error-handling--security)
- [Tests](#tests)

---

## Project Management

- **Project switcher** (start screen): a list of recently opened projects (name +
  file path, one click reopens them, up to 10 entries), a form to open a project by
  the path of its `projekt.json`, and a button to create a new project via the
  **project wizard**.
- **Project wizard**: five guided steps instead of a single form —
  basics (name, project file location, scan folder), folder naming convention
  (suffixes, export template, pre-filled with the default values), initial
  languages (a freely editable list, by default pre-filled with just the one
  content language guessed from the current UI language — multi-language support
  remains available at any time via "Add", but is never forced on anyone working
  single-language) and, optionally, initial volumes. The wizard actively helps
  create the necessary folders: if the scan folder is missing, it can be created
  directly (including a live check whether volumes are already found there); for
  each volume created in the last step, a `<Name><emptySuffix>` folder and a
  `<Name>_<folderSuffix>` folder per selected language are created immediately.
  The last step shows a summary and only then creates the actual project file.
- **Project file**: each project is exactly one JSON file bundling name, scan
  root, folder suffixes, export template, description, languages, and characters
  — the complete project configuration therefore lives portably in a single file
  instead of being spread across server-internal data.
- **Settings form** (Project menu → Settings, on every screen): description
  (free text), scan root folder (with a live check whether the folder actually
  exists from the server's point of view — a red warning if not), suffix for
  "empty" (untranslated) page folders (e.g. `_empty`), suffix for the lettering
  JSON folder (e.g. `_lettering`), and the export folder naming template with
  `{book}`/`{folderSuffix}` placeholders. Optionally also a
  [project asset folder](#project-asset-folder) for project-specific fonts/SVG
  contours/images, and, independent of that, a custom thumbnail folder.
  Additionally the **reading direction** (right-to-left/Japanese manga, the
  default, or left-to-right/Western) — determines the automatic
  [reading order](#reading-order) of panels and bubbles for the whole project;
  existing projects without this field remain unchanged at right-to-left, the
  previous implicit assumption.
- **Built-in file/folder browser**: since a normal `<input type="file">` doesn't
  return an absolute path, the tool brings its own server-backed filesystem
  browser — lists drives (Windows) as roots, allows navigating up/down, and
  selects either a folder ("Choose this folder") or a `.json` file directly.
  Used for scan-root selection and for opening/creating project files.
- **Volume detection**: the server recursively searches the scan root (up to depth
  5) for folders ending in the configured "empty" suffix (e.g. `*_empty`), treats
  each as one "volume", and determines which language folders already exist next
  to it.
- **Migration of old projects**: old single-project files (`settings.json`/
  `languages.json` from previous versions) are automatically converted into a
  real project file once, on first startup, without touching the originals.

## Accounts, Roles & Access Control

- **Server-wide accounts**: username + password (passwords hashed server-side
  with `scrypt`, no plaintext, no native dependency). On the very first startup
  (no accounts yet exist) the app shows an initial-setup screen instead of a
  login — the account created there automatically becomes system administrator.
  Optional **email address** per account (settable by the user themselves under
  "My Account", or by a system administrator) — used exclusively for
  [@-mention notifications](#review-comments), needed nowhere else.
- **Login**: JWT bearer token (`Authorization` header), stored in the browser's
  `localStorage`, valid for 30 days. Works unchanged when client and server run
  on separate origins (see the configurable API base URL).
- **Project-scoped roles**: Viewer (read-only) < Translator (bubble text +
  glossary) < Letterer (full editing: layout, panels, presets, export,
  font/image/SVG upload) < Admin (additionally project settings and member
  management for that project). A project's member list lives portably in its
  own project file (like characters/glossary/presets) — so it moves along when
  the file is copied/moved.
- **System administrator** (server-wide account flag, independent of individual
  projects): full bypass access to every project regardless of its member list,
  plus sole access to project-switcher actions (create/delete/archive project,
  browse the filesystem) and server-wide account management.
- **Translator restriction**: since there is not (yet) a dedicated "text only"
  endpoint, translators and letterers share the same save endpoint for the page
  layout — for the "translator" role, the server compares the incoming layout
  against the last saved version and rejects any change outside the bubble-text
  fields. In the editor itself, translators only have the text fields active, no
  geometry tools.
- **Member/account management**: via the "Project" menu — "Members" (this
  project's role, visible from Admin up) and "Accounts" (server-wide accounts,
  visible only to system administrators).

## Multi-User Operation

Multiple people connected at the same time is the normal case (studio network or
shared server), hence three targeted safeguards against silent data loss, plus
(new) a first step towards genuine multi-project concurrency:

- **Optimistic conflict detection on page save**: the editor remembers an ETag
  (content hash) of the last loaded/saved version of a page and sends it along
  when saving. If someone else has saved the same page in the meantime, instead
  of a silent overwrite a dialog appears: **"Keep my version"** (deliberately
  overwrites the other one) or **"Load other version"** (discards your own
  unsaved changes). The same ETag/If-Match pattern is also available server-side
  for the script endpoint (`GET`/`PUT .../script`), so far without a dedicated
  client UI for it.
- **Serialized writes** (no conflict dialog, but no data loss from interleaving
  multiple simultaneous requests): comments, script, and project metadata
  (settings, languages, characters, glossary, presets, member list) serialize
  their read-modify-write per file through a simple in-process mutex — two new
  comments arriving at the same time both land, instead of one displacing the
  other.
- **Warning on project switch**: since the server can only keep one project
  active at a time, switching (opening/creating a project) would otherwise pull
  the rug out from under other people currently active, without warning. If
  another person has been active on the server in the last five minutes, the
  client asks before switching ("{names} were recently active — switch anyway?")
  instead of switching immediately; confirming switches anyway.

- **Multi-project access, phase 1+2 (server-side)**: previously the whole server
  ran with exactly one active project in memory (a global singleton) — every
  switch necessarily affected everyone connected. Every project now gets a
  stable ID (`ProjectFile.id`, assigned once and written back for legacy
  projects on first load), and the server keeps up to eight projects
  simultaneously in a capped cache (`server/src/lib/projectStore.ts`). For
  **every** content router (volumes, pages, layout, export, script, comments,
  fonts/images/SVGs, languages, characters, glossary, presets, settings), in
  addition to the existing routes there are now new, project-scoped routes
  under `/api/p/:projectId/...` (`server/src/lib/projectContext.ts`) — two
  requests with a different `:projectId` demonstrably see different projects,
  regardless of order.
- **Multi-project access, phase 3 (client rework)**: the client itself now knows
  a project in the URL — the entire volumes/pages/editor/script/export/reader
  route scheme lives under `/p/:projectId/...` (`client/src/main.tsx`), instead
  of implicitly meaning "the one open project". Which project a browser **tab**
  is currently showing is a purely in-memory value per tab
  (`client/src/api/projectScope.ts`, deliberately not in `localStorage` like the
  auth token — otherwise two tabs could never keep two different projects open),
  set synchronously when `ProjectProvider` renders
  (`client/src/state/ProjectContext.tsx`, still wraps the whole app shell
  including the header) from the `:projectId` segment of the current URL. All
  project-related `api.*` methods (`client/src/api/client.ts`) go through a
  `projectApiUrl()` helper that automatically rewrites to the scoped route, with
  an unscoped `/api/...` fallback as a safety net. Result: two browser tabs can
  now genuinely have two different projects open and in edit simultaneously,
  without affecting each other — manually verified with two real tabs against a
  running server (including a reload in the middle of a `/p/:id/volumes/...`
  URL via the new bootstrap route `GET /api/p/:projectId`, and the `/` →
  `/project` redirect for the case of no project at all in the URL).

**Deliberately out of scope (so far)**: disabling the unscoped legacy routes
(phase 4) — they remain as a safety net until the client rework has proven
itself in practice. The project switcher itself (`/api/project`,
create/open/archive/member management — operates on project *files* anyway, not
"the currently open project") as well as server-wide filesystem search remain
deliberately singleton-only, since they don't concern a single project. Conflict
detection for the rarer management lists (settings/languages/characters/
glossary/presets/member list — only the write mutex there, no ETag dialog) also
remains open; see `docs/Professional-Workflow-Gaps.md`.

## UI Language

- The **interface itself** (labels, buttons, menus, tooltips, confirmation
  dialogs, error messages) is available in seven languages: English, German,
  Japanese, French, Spanish, Chinese (Simplified), and Korean — implemented via
  `react-i18next` (`client/src/i18n/`).
- **Important distinction**: this is completely independent of
  [Language Management](#language-management) above — that manages a
  *project's* content languages (which languages the comic dialogue itself is
  translated into). A user can set the UI to English, for example, and still
  maintain German/Japanese as translation languages in the project.
- **Switcher** in the app header (next to "Settings"), shows each language in
  its own name (e.g. "日本語", "한국어"). Switching translates the currently
  visible page immediately, without reloading.
- **Default language**: on the very first startup the browser/system language is
  detected; if none of the seven match, English is the fallback. The chosen
  setting is stored client-side in `localStorage` (key `comikumi.uiLocale`) — a
  purely machine/browser setting, not part of the project file.
- **Server error codes**: API error responses are stable `snake_case` codes
  (`{ error, params? }`) instead of raw prose — the client translates them via
  the `errors.*` namespace (`client/src/api/client.ts`'s `ApiError` +
  `client/src/i18n/translateApiError.ts`).
- **Translation quality**: all seven language versions were created directly (no
  external translation service) — technically sound, but without native-speaker
  review. Sufficient for internal use; for a public release a proofreading pass
  by native speakers would be advisable.

## Volumes & Pages

- **Volume list**: every detected volume as a card (folder name, languages
  already present), leads to the page overview. Without any `*_empty` folders
  found, the screen explains why and points to Project → Settings.
- **Page overview**: a thumbnail grid of all pages in a volume (lazily loaded,
  cached server-side as JPEG and automatically regenerated when the source file
  changes), one click opens the editor for that page. Shows a page counter in
  the status bar. The cache lives in a separately configurable
  [thumbnail folder](#project-asset-folder), by default right next to the
  project file.
- **Upload pages**: via "Page → Upload pages…" one or more page scans can be
  uploaded directly from the browser into the volume's `_empty` folder —
  important as soon as client and server run on separate machines (previously a
  new page could only be added by copying the image file directly into
  `scanRoot` on the server machine). If a page with the same filename already
  exists, a dialog asks before overwriting. Every page card also has a "Delete"
  button — removes only the source file (a lettering file already saved for
  this page is always kept) and **non-destructively**: the file lands in a
  `_trash` folder right next to `scanRoot` (with a timestamp in the filename and
  the same relative folder structure as the original), instead of being
  permanently deleted immediately. A system administrator can restore a file
  manually at any time by moving it back to its original location and removing
  the timestamp prefix. An automatic background sweep (every 6 hours,
  `server/src/index.ts`) then cleans up the trash on its own — how long a file
  stays there before being permanently removed is configurable under Settings →
  "Trash retention (days)" (default: 30 days).
- **Create empty page**: via "Page → Empty page…" a completely empty (white)
  page of a chosen size can be created instead of an upload — for pages that
  aren't built from a full scan but are assembled panel by panel from
  already-finished individual artwork (see
  [Replacing panel content](#cut-panel) and the panel grid templates in the
  editor toolbar). Uses the same upload path as above, behaves afterwards like
  any other page, and opens directly in the editor.
- Both screens have a **"Project" menu** (switch project, manage characters,
  open settings) as well as a menu bar with import/export actions (see
  [Export & Import](#export--import)), a "Report for volume" entry, and a
  status/message bar for background operations.

## Chapters

Lightweight per-volume tagging, not a separate structural entity — a page
optionally references a `type` ("cover"/"chapter divider"/"story", used for
cover detection and excluding non-story pages from the running page number)
and a chapter. Chapter *order* is never stored: a chapter's position is
always derived from the volume's own page order (the first page assigned to
it), so chapter order and page order can never disagree.

- **Manage chapters** ("Page" menu) — a simple add/rename/delete list. Each
  page card in the page overview has a chapter dropdown to assign/change it.
- **Visual grouping in the page overview**: pages are shown in section
  headers by chapter (only once at least one chapter exists — an untagged
  volume still shows a plain grid). If a chapter's pages aren't contiguous in
  the volume, its name simply appears as a section header again further
  down instead of silently hiding the gap — a visible hint rather than a
  blocked action, since drag-reordering across chapter boundaries never
  changes a page's chapter on its own.
- **Chapter export**: the export dialog's page-selection modes gain a
  "Chapter" option (resolves to that chapter's pages, wherever they sit in
  the volume) — works for every raster/print/vector-PDF/PSD export. The
  Export-Viewer screen's ZIP and CBZ downloads get the same chapter filter
  next to the language selector, restricting the archive to just that
  chapter instead of the whole exported folder.
- **CBZ chapter bookmarks**: building a CBZ automatically writes a
  `Bookmark` attribute (an otherwise-unused ComicInfo.xml field) onto the
  first page of every chapter that has one — readers like Komga/Kavita use
  this to build a chapter navigation list. Fully automatic, derived from the
  chapters already defined; no extra configuration.
- **Volume report & QA-check chapter awareness**: the volume-wide report
  gains a chapter filter (restricts "who says what"/character lists to one
  chapter); the QA checker groups its findings by chapter within each
  category instead of one flat list, with separate buckets for untagged
  pages and for findings not tied to any single page (e.g. duplicate
  presets).

## Language Management

- **Languages** are defined project-wide: a code (e.g. `de`), a display name
  (e.g. "Deutsch"), and a folder suffix for the export convention (e.g.
  `volume_01_german`).
- **Language management** (popover, both compact in the language bar and as a
  full form): add a language (folder suffix is derived automatically from the
  name but can be manually overridden), delete a language (with a confirmation
  prompt — already-translated text stays in the JSON, only losing its tab). The
  server rejects duplicate codes/folder suffixes with an error.
- **Language bar**: the vertical language switcher next to the (collapsible)
  text sidebar in the editor — clicking a tab (`DE`, `EN`, `JP`, …) switches
  which language the inspector is currently editing; the "+" chip opens the
  compact language management directly within it.
- **Language-specific overrides**: virtually every text-formatting field of a
  bubble/curved text (font, size, line height, alignment, reading direction,
  outline, gradient) as well as the entire visual shape (position/size/
  rotation/background) can be overridden per language via a toggle ("All" vs.
  active language) right next to the respective field — e.g. Japanese
  vertical with one font while German/English stay horizontal and use a
  different font; a translation that needs more space can get its own,
  repositioned bubble shape.

## Character Management

- **Characters** are a project-wide cast list: ID, name, a color, and
  **voice notes** (free text: manner of speech, personality, catchphrases,
  formality — the "character voice bible"). Referenced via `characterId` on
  the bubble (not duplicated on the page) — renaming, recoloring, or updating
  voice notes never needs to touch a single page.
- **Character management** (modal, reachable via the "Project" menu on every
  screen): create a character (name, color picker, voice notes), edit by
  clicking an entry, delete (with a warning that bubbles with that assignment
  only lose the assignment, they are not deleted).
- **Assignment**: per bubble via a dropdown in the bubble inspector or via the
  right-click context menu on the canvas ("Assign character" submenu). Feeds
  directly into [Reports](#reports) and the [Context View](#context-view) — the
  voice notes are shown there and under the character dropdown in the bubble
  inspector as soon as a bubble is assigned a character with notes.

## Story Bible

A dedicated area for worldbuilding/story content (character profiles, locations,
objects, factions, ...) — a **generic entity system**, reachable via the new
"Story Bible" entry in the "Project" menu (`client/src/routes/StoryBible.tsx`,
its own full route under `/p/:projectId/story-bible`, not a modal like the
leaner managers).

- **Entries** have a free-form `type` (no fixed enum — e.g. "character",
  "location", "item", "faction"; the client suggests common types as well as
  types already used in the project when creating one), name, color, a short
  description, and a free-text notes field.
- **True unification with bubble tagging, no duplicate management**:
  `type === "character"` entries are exactly the same records also used for
  `Bubble.characterId` in [Character Management](#character-management)
  (`server/src/lib/projectStore.ts` still exposes the same narrow view for the
  old `/api/characters` API, but internally on the same data) — renaming a
  character or updating their notes takes effect at both places immediately,
  there are no two separate lists. Projects created before this feature are
  automatically and once migrated on first load (same IDs carried over, every
  existing bubble assignment remains valid).
- **Reference images/sketches**: every entry has its own image gallery
  (upload/delete individual images), technically built on the same asset-router
  building block as [Project Assets](#project-asset-folder), just with its own
  folder per entry.
- **Relationships**: directed, freely labeled links between two entries (e.g.
  "is sister of", "works for") — a project-wide list, visible on both linked
  entries. Deleting an entry automatically removes every relationship that
  references it.
- **Roles**: reading for every project member; creating/editing/deleting
  entries/relationships from the "translator" role up (like the glossary —
  editorial content, not lettering production work); uploading/deleting images
  from the "letterer" role up (like every other asset upload in the app).

## Lettering Presets

Project-wide, live-linked style templates (e.g. "Bubble Style", "Character
Style", "Narration Style", "SFX Style") for text style and bubble background —
managed via a modal in the "Project" menu on every screen (create, edit by
clicking an entry, delete). Applicable to bubbles **and** curved texts (curved
texts only use the text-style part, no bubble background).

- **Sparse/granular per field**: a preset can deliberately define only part of
  the ~17 fields (e.g. just the font) — every field is individually toggleable
  via a checkbox. Fields not defined remain entirely up to the individual
  bubble/curved text and are never touched by the preset. This way, for
  example, the font of all SFX bubbles can be changed at once without
  overwriting individually set font sizes.
- **Live linking**: a bubble/curved text carries a `presetId`. Changing a field
  defined by the preset in the preset itself updates all linked elements
  immediately — without reloading, equally in the live preview **and** the PNG
  export. A deleted preset is treated like a deleted panel/deleted character:
  the link automatically falls back to the bubble's own base value.
- **Precedence** (most specific wins): language override > preset-defined field
  > the bubble's/curved text's own base value. A `formOverride` (a complete
  language override of the entire bubble shape) always wins regardless of
  presets.
- **Scope**: text style (font, size, line height, alignment, reading direction,
  color, outline, gradient) and, bubbles only, bubble background (bubble style,
  fill/border color, border width, tail type including chain details). Pure
  geometry (position/size/rotation, tail tip/anchor/width/curvature) is
  deliberately not a preset field — those are instance properties of an
  individual bubble, not "style".
- **Assignment**: via a preset dropdown in the bubble/curved-text inspector, or
  via the right-click context menu on the canvas ("Assign preset" submenu,
  bubbles only). Every field controlled by the current preset is shown disabled
  in the inspector (with a note of which preset defines it) — unless a language
  override for it is active, which always wins. A "Detach from preset" button
  freezes every value currently taken from the preset into the bubble/curved
  text once and removes the link, without any visual change.
- **Starter library**: an "Add from library" row offers a handful of built-in
  presets ("Manga SFX", "Whisper", "Shout") — one click adds a copy to the
  project's own preset list via the normal create-preset call, so it's
  immediately editable/deletable like any other preset. Not pre-populated
  into new projects automatically; a project only gets these if someone
  explicitly clicks to add them.

## Editor — Canvas Basics

- **Zoom & pan**: mouse wheel zooms toward the cursor (20%–600%), dragging on
  empty space pans the view, +/- buttons and "Reset" in the status bar, a live
  percentage readout.
- **Automatic fit**: the page image is scaled to the available area (tracked
  via ResizeObserver) so tall pages fit in height and the page never forces a
  scrollbar.
- **Selection**: clicking a bubble/image/curved text/panel selects it;
  shift-click adds it to/removes it from a multi-selection. Clicking empty
  space clears the selection. Switching to a different element *type* while
  holding shift always starts a new, type-pure selection — mixed
  multi-selection across types is deliberately unsupported.
- **Move/scale/rotate**: every element type has its own drag handles
  (rect/oval bubbles rotate/scale around their center to match the PNG-export
  math; quad bubbles and images drag individual corner points for free
  perspective distortion).
- **Keyboard shortcuts** (global, disabled while a text field is focused):
  Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, Ctrl+D duplicate, Escape clear
  selection, Del/Backspace delete selection, arrow keys move the selection by
  1px (10px while holding shift).
- **Drawing tools**: an activated tool (oval/rect/quad bubble or "panel") turns
  dragging on the canvas into a preview box that, once above a minimum size
  (>5px), becomes a new element of that size/type.
- **Right-click context menu**: appears at the click position (fixed to the
  screen, independent of zoom/pan), automatically stays within the visible
  area, closes on click outside or Escape. On a bubble: "Assign panel" and
  "Assign character" submenus (built live from the current layout, current
  assignment marked), plus duplicate/delete. On a panel (area, not corner
  point): duplicate/delete; on an individual panel corner point or a quad
  bubble corner, additionally "Set angle" (two variants — fix the previous or
  the next point, with an input field for the exact angle in degrees; the
  neighboring point that isn't fixed rotates around the clicked point until
  exactly that angle is reached, edge length is preserved), and on a panel
  corner point additionally "Remove point" (disabled once only 3 points
  remain). Submenus expand inline (no hover flyout).

## Element Types

### Speech Bubbles

Three shapes — rectangle, oval, and a free "quad" (perspective) whose four
corner points can be dragged independently; the text is warped with a true
projective transform (e.g. for a sign seen at an angle).

Bubble background styles: none (an invisible overlay on existing artwork),
speech bubble, thought bubble, effect (jagged edge), or a custom uploaded SVG
contour. With a visible style: fill/border color, border width, and an optional
pointer/tail with its own style — seamlessly connected, free-standing, or a
segmented "chain" (circle/rectangle/diamond segments, count and spacing
configurable) — position, width, and curvature are all adjustable via canvas
drag handles.

Text options: font (custom uploaded fonts), size, line height, horizontal
alignment, and reading direction — horizontal LTR, horizontal RTL, or vertical
(tategaki) including furigana (`{漢字|かんじ}`) and automatic tate-chū-yoko
(sideways digit/Latin runs). Furigana supports both group-ruby (one reading
spread evenly across a multi-character base, e.g. `{大人|おとな}`) and
mono-ruby (a separate `{base|reading}` block per character, e.g.
`{東|とう}{京|きょう}`) — writing 2+ of these blocks back to back automatically
keeps them together as one word across a column break, the same protection
plain multi-kanji words already had. Vertical text also supports bōten (圏点)
emphasis dots — the traditional Japanese equivalent of bold/italic — via
`{text*}` (e.g. `{最悪*}`), drawn as a small dot beside each marked character;
the same multi-character word-cohesion protection applies. For a vertical
bubble, two toolbar buttons ("Insert furigana"/"Insert bōten") wrap the
current text selection in the right markup automatically instead of typing
the `{...}` syntax by hand — the furigana button also checks the project
glossary (see [Glossary](#glossary)) and pre-fills a stored reading when the
selection matches a translated term. Text can have an outline and/or a linear gradient
instead of a solid color. Every one of these style fields (and the entire
shape/position/size/rotation/background) can be overridden per language.
Bubbles can be assigned to a panel and a character.

**Effect (SFX) bubbles**: a dedicated toolbar tool next to the three shape
tools draws a bubble exactly like the rectangle tool, but marks it as a sound
effect/onomatopoeia instead of spoken dialogue. Any existing bubble can be
switched to (or out of) this mode from a checkbox in its inspector — useful
for onomatopoeia lettered before this distinction existed. An effect bubble
is still a completely normal bubble (any shape, style, panel/character
assignment, translation-memory matching); the only difference is that it's
excluded from the "who says what" reports, from the dialogue lines a script
is auto-generated with (see [Script Editor & Script Sidebar](#script-editor--script-sidebar)),
and from the missing-translation QA check — none of which make sense for a
sound effect. It still appears normally in reading-order navigation and the
Layers navigator (see [Locking](#locking)), tagged "Effect" there instead of
"Bubble".

**Clipping**: a rect/oval/thought/shout/SVG bubble can be cut along a straight
line — dragged freely on the canvas via two handles, with a "Snap to panel
edge" button in the bubble inspector that suggests a starting line from the
nearest edge of the bubble's assigned panel (a one-time suggestion, not a
persistent binding — the panel can move afterward without dragging the line
along). A "Flip" toggle switches which side of the line is kept. Text
automatically insets away from the clipped-off side so it never overflows into
it. Not available for "quad" bubbles.

**Merging**: two or more rect/oval/thought/shout/SVG bubbles can be merged
into one continuous outline (the geometric union of their individual shapes —
e.g. two overlapping ovals become one waisted "figure-8" outline) via
"Merge bubbles" in the multi-selection inspector, non-destructively: the
source bubbles keep their own data, only one (the "primary", the first bubble
selected) carries the merged shape's shared, continuous text and tail — the
other members' own text/tail are hidden while merged, not deleted. "Undo
merge" restores every original bubble exactly as it was, including any text
they held before merging. Not available for "quad" bubbles; only supported by
the live editor and the PNG export (not the vector-PDF/PSD export paths).

**Inner padding**: the gap between a bubble's outline and its text normally
follows an automatic per-shape default. A checkbox in the bubble inspector
lets it be overridden per bubble with an explicit 0–90% slider instead — handy
for a bubble whose auto padding leaves text feeling too cramped or too loose.
The same field can also be set on a [preset](#lettering-presets) to apply one
padding value across every linked bubble at once. Applies to every export
path (PNG, vector PDF, PSD) identically; not available for "quad" bubbles.

**Balloon-aware line-breaking**: for oval bubbles, a checkbox in the bubble
inspector (or a [preset](#lettering-presets) field) can derive each line's
usable width from the bubble's actual ellipse shape instead of fitting every
line into one fixed, uniformly-inset rectangle — lines near the vertical
center can run wider, lines near the top/bottom edge narrower. Works for both
horizontal and vertical (tategaki) text; off by default so already-lettered
pages don't silently re-wrap. Per-language, like font size/align/direction —
a language whose translation runs long can turn it on while others keep the
plain rectangle. Renders identically in the live editor, PNG export, vector
PDF, and PSD export. Not available for "rect" bubbles (no effect there) or
"quad" bubbles (their own text-warp pipeline).

### Images

A placed raster image, warped into a free quad (same corner-drag mechanism as
quad bubbles) — for things text can't cover, e.g. a newly drawn/translated sign
or poster. The actual image file can differ per language (uploaded from a
shared image library), with an opacity slider; a language without its own file
automatically falls back to another assigned language, so the element is never
left empty.

### Curved Text

A free-standing title/effect text (e.g. a logo-style chapter title or an
onomatopoeia like "BOOM!") that runs along a cubic Bézier curve with 4 draggable
control points, instead of sitting in a bubble box. Deliberately single-line/
without a reading-direction option (a focused title/effect tool, not a second
full-text layout system) — font, size (shrinks automatically to fit the curve),
alignment along the curve (start/middle/end), color/outline/gradient, all with
the same per-language override pattern.

### Panels

A manually drawn reference polygon marking a comic panel — a pure editor
annotation with a label (automatically "Panel N" if left blank) and a border
color. Starts as a rectangle when drawn, but is afterwards a freely shapeable
polygon (not limited to 4 right angles, matching skewed or many-sided manga
panels): dragging the whole area moves it, a single corner point reshapes it,
double-clicking the outline inserts a new point there, right-clicking a point
removes it (at least 3 points are always kept). Bubbles can be manually
assigned to a panel to enable "who says what per panel" evaluations. **Never
appears in the PNG export.**

Besides the individual panel tool, the toolbar offers a **panel grid menu**
with common templates (1 panel/whole page, 2/3 stacked, 2×2, 2×3) — creates
several evenly distributed panels with one click, each already in the state
["replaced by custom image"](#cut-panel) (enabled for every language): just
click and assign the finished panel artwork. Intended for the
panel-by-panel construction of an [empty page](#volumes--pages).

## Auto-Bubbles (Detection & OCR)

A toolbar tool that finds speech bubbles for you instead of drawing every one
by hand: runs entirely client-side (no server round-trip, no data leaves the
browser) in two steps —

1. **Detection**: a text-region detector finds every likely speech-bubble
   area on the current page and draws a box around each one.
2. **Recognition (OCR)**: the text inside each detected box is read
   automatically and pre-filled, so most bubbles need no manual typing at all.

Both models load lazily on first use (large files, cached persistently in the
browser afterward — not re-downloaded on reload) and run via WebGPU where
available, falling back to WASM automatically. Every result — box position,
recognized text, and a confidence score — appears in a **review panel**
before anything is added to the page: each region can be accepted, edited, or
rejected individually; only accepted regions become real bubbles once
confirmed. Nothing is written to the page automatically without this review
step.

The OCR step only works for Japanese source text — the underlying model's
vocabulary is Japanese-character-only, so feeding it any other script (Latin,
Cyrillic, etc.) is expected to produce meaningless output by design, not an
empty/graceful result. The box-detection step is language-independent and
stays useful on its own for finding bubble positions on any page — for a
non-Japanese source, expect to type the recognized text by hand in the review
panel same as before this feature existed. Both models are third-party, permissively-licensed (Apache-2.0/GPL-3.0) open weights,
documented in full in `docs/ocr-model-provenance.md`.

## Locking

Every element (bubble, panel, image, curved text) can be individually locked
against accidental moving, reshaping, deleting, and duplicating. A selected
element shows a small lock icon at its corner — open means unlocked, closed
means locked; clicking it toggles the state. While an element is locked:

- Dragging, resizing, rotation, and outline points can no longer be moved.
- The Delete key and duplicate (Ctrl+D) have no effect — not even via the
  right-click menu. If the element is part of a multi-selection, only the
  unlocked elements are affected, the locked one is left untouched (and
  selected).
- Text/style editing in the inspector remains possible — the lock only
  concerns geometry.

Toggling an element's own lock icon only affects that element — a locked
panel does not automatically protect its assigned child bubbles this way
(see [Element Types](#element-types) → Panels); those remain independently
lockable/editable through their own icon. The lock is only stored in the
saved layout if the element was locked last (see `locked` in
[JSON-Format.md](JSON-Format.md#bubble)).

### Layers / Panel Navigator & Bulk Locking

Since panels often sit visually on top of bubbles and other overlays, they
can make it hard to click precisely on what's underneath — and locking every
panel one by one is tedious. The **Layers panel** (toolbar icon next to the
text-list toggle) solves this: it lists every bubble, image, and curved text
on the page grouped by the panel they belong to (elements with no panel are
grouped separately), each with its own lock toggle and a click-to-select row.
Groups can be collapsed/expanded, and clicking a panel's group label selects
that panel on the canvas.

From the Layers panel, the panel context menu, and the **Edit** menu, three
bulk actions are available:

- **Lock/unlock all panels** — toggles every panel on the page at once
  (bubbles/images/curved texts are untouched).
- **Lock/unlock panel + contents** — right-click a panel (or use its lock
  icon in the Layers panel) to lock the panel together with every bubble
  assigned to it (`bubble.panelId`) in one step. Images and curved texts have
  no panel assignment and are never included in this cascade, even if they
  visually sit inside the panel's area.
- **Lock/unlock selection** — with multiple elements selected (shift-click),
  the multi-selection inspector's Lock/Unlock buttons apply to every selected
  element regardless of type, in one step.

### Layer Order (Z-Order)

Bubbles, placed images, and curved texts each paint in a fixed order by
default (images below bubbles below curved texts) — but any of them can be
explicitly reordered relative to the others, e.g. to let an image patch
covering part of the original artwork sit *in front of* a bubble instead of
behind it (useful when an object in the panel — hair, an arm, a prop —
should visually overlap a bubble, something a straight clip line alone
can't do; see [Speech Bubbles](#speech-bubbles) → Clipping). Every bubble/
image/curved-text row in the **Layers panel** has "Bring to front"/"Send to
back" buttons; a bubble's right-click context menu has the same two
actions. Panels themselves aren't part of this — they're an editor-only
reference layer, always drawn at the very bottom, never exported.

Respected everywhere the page is actually rendered: the editor canvas, PNG
export, and the layered PSD export (each bubble/image/curved-text PSD layer
is ordered to match). The one exception is the vector-PDF export, which
flattens Cut-Panels/images/bubble backgrounds into one raster layer with
real vector bubble text always drawn on top in a separate pass — an image
brought in front of a bubble elsewhere still renders behind that bubble's
text there.

## Cut Panel

No dedicated toolbar button and no dedicated data type — every
[panel](#element-types) can additionally be upgraded to a cut panel in the panel
inspector via a "Enable cut panel for "{language}"" button: its content is
thereby visually detached from the original page (`_empty` source file) and can
then be moved freely. Typical use cases: moving a panel for an RTL→LTR relayout
to a different spot on the page, or correcting a slightly misaligned panel —
entirely without an external graphics program.

**Activation** comes in two variants:
- **"Enable for all languages"** — detaches the panel content for every
  language at once (writes to the panel's base fields). The right choice when
  the panel content is language-independent — first and foremost for
  [panel-by-panel construction of an empty page](#volumes--pages) from
  finished individual artwork: assign an image once, visible in every project
  language, no re-upload needed.
- **"Enable cut panel for "{language}""** — affects only the currently active
  language; every other language remains an unmodified, normal panel. Intended
  for targeted exceptions (e.g. a sign that only needs to be localized in
  "de"/"en" but stays unchanged in the Japanese original). A "...disable"
  button (appears as soon as cut behavior is active for the active language)
  specifically reverses this for exactly that one language (see
  [Language-Dependent Behavior](#language-dependent-behavior) below).

Behavior (otherwise identical to a normal panel — label, border color, child
bubble assignment, locking, duplicating, deleting all work the same):

- **Moving the whole area** carries the detached content along to the new
  position. The vacated original spot is covered with a fill area — the fill
  color is initially taken from the panel's border color when upgrading and can
  be changed manually in the panel inspector at any time. This is
  **non-destructive**: the `_empty` source file itself remains unchanged, the
  cover-up only happens at render time (preview as well as PNG export).
- **Reshaping a single corner point** corrects the outline without moving the
  panel — the displayed crop of the original page automatically adapts to the
  new shape.
- A cut panel that has never been moved looks visually identical to an
  unmodified panel area (the hole fill and the crop match exactly).

### Three Content States of a Cut Panel

In the panel inspector, a single "Content" selector determines what is shown at
the current panel position — the three options are mutually exclusive:

- **"Original crop"** (default) — the content as described under "Cut Panel"
  above (move, reshape).
- **"Removed (non-destructive)"** — the original spot is only covered up, the
  content is **nowhere** redrawn: the panel disappears visually entirely, in
  both preview and PNG export. Purely visual/semantic and reversible at any
  time by switching back to "Original crop" — geometry and assigned child
  bubbles remain completely untouched. However, a panel removed this way
  counts as semantically no longer present for script, reports, and reading
  order (`groupBubblesByPanel()` in `reportUtils.ts`) — a bubble assigned to it
  appears in the "No panel" group instead. In the panel-assignment
  dropdown/context menu the panel remains visible, marked "(removed)".
- **"Replaced by custom image"** — see next section.

Independent of this, the existing **"Delete panel" button** remains: it
permanently removes the panel record from the page and decouples its child
bubbles (back to absolute coordinates) — not reversible except via undo. The
"Content" selector, in contrast, never affects the record itself, only what is
rendered.

### Replacing Panel Content

Instead of moving or removing the original crop, it can also be replaced with a
**custom uploaded image** — e.g. to swap out incorrect image content or meet a
censorship requirement, without having to recreate the whole page. In the panel
inspector under "Content" → "Replaced by custom image", then upload an image or
choose one from the library via the same image-picker dialog used when inserting
a placed image — per language individually (like placed images: if the active
language has no own image, some other assigned language is shown instead of
staying empty).

The replacement image is projected onto the bounding box of the current panel
polygon and clipped to its actual shape (no true 4-point perspective warp like
placed images/quad bubbles — a panel polygon can have any number of corner
points, not necessarily 4). A **"Fit"** toggle in the inspector determines how
the image is fitted into the bounding box: **"Stretch"** (default, distorts on
a mismatched aspect ratio) or **"Preserve aspect ratio"** (the image is fitted
centered, without distortion — with empty space on the shorter edges instead of
stretching). Optionally a border (color + width) can also be placed around the
replacement image — unlike the panel border color (a pure editor outline, never
in the export), this border is actually drawn into the PNG export.

**Flip horizontally**: independent of moving/removing/replacing, the displayed
panel content can additionally be flipped horizontally — via a context-menu
entry or a toggle in the panel inspector, settable **per language** (like every
other [language-dependent cut-panel behavior](#language-dependent-behavior)).
Typical use case: adjusting a speaking/motion direction in the panel to a
changed reading direction, without editing the original artwork externally.

### Language-Dependent Behavior

Whether a panel is a cut panel at all is itself a **per-language toggle** — not
just its details. The "Enable/disable cut panel for "{language}"" button in the
panel inspector affects only the currently active language; position/shape,
"Content" state, hole fill, and replacement image/border can then additionally
be set differently **per language**, via the "Custom version for "{language}""
checkbox (only relevant once cut behavior is active for that language). This
means the same panel is simultaneously an unmodified reference marker in one
language and a fully edited cut panel in another — **a single entity** covers
both roles, there is no separate panel type.

Example: a panel remains unchanged in place in "ja" (original) — a purely
semantic marker, no visible effect, no cut behavior enabled. In "de"/"en", by
contrast, it was deliberately enabled and is moved, removed, or replaced with a
custom image there (e.g. for an RTL→LTR relayout or a censorship requirement in
the target market).

- Without activation for a language, the panel behaves there like a completely
  normal, unmodified panel — regardless of whether/how it is enabled for other
  languages. Older, still language-independent cut panels from earlier work
  states are unaffected by this: they continue to simply apply the same way to
  every language, until a language is specifically enabled/disabled
  differently.
- Enabling/disabling takes over the currently displayed geometry 1:1 when
  toggled (no visual jump) and automatically creates a language override for
  it; the "Custom version" checkbox shows this state and allows a full reset
  back to the base.
- **Child bubbles are unaffected by this**: their position always stays
  relative to the panel's **base** anchor, regardless of whether and how the
  panel is moved for the currently active language. Anyone who wants to
  position a bubble differently per language still does so independently via
  the bubble itself (language override of the bubble shape).
- A panel "removed" in one language (see above) is also only considered
  semantically absent for script/reports/reading order in **that** language —
  in every other language without this override it appears there completely
  normally.
- Locking (`locked`) deliberately **always applies across all languages** — a
  lock should hold regardless of which language is currently active.

## Text List

A collapsible sidebar with every bubble/curved text on the current page in
reading order (top to bottom), multi-line text collapsed to a single line (line
breaks shown as "⏎"). Has its own language selector, independent of the active
editing language, so e.g. the Japanese source text can be read along while the
German translation is being edited elsewhere. Clicking an entry selects the
associated bubble/curved text on the canvas.

## Reading Order

Panels are first automatically grouped into Y-"rows" (panels whose vertical
bounding boxes overlap count as one row — no fixed pixel threshold, works
independent of wildly different panel sizes), then sorted within a row by the
project-wide [reading direction](#project-management) (right-to-left for
Japanese/manga, left-to-right for Western comics). The same row +
reading-direction logic also determines the order of bubbles within a panel
(or in the "no panel" collection) — previously this was a pure Y-sort, which
gave no reliable order for bubbles/panels sitting side by side at similar
height.

Additionally, every bubble has a reading position within its group (its
assigned panel, or the "no panel" collection). An optional field
(`readingOrderOverride`) allows a manual correction for cases where even the
row/reading-direction sort doesn't match the actual narrative order — the
manual override always wins, regardless of reading direction. Edited via the
up/down buttons in the [Context View](#context-view) — a click swaps the
bubble with its neighbor in the group and renumbers the whole group, so the
order stays unambiguous even after several corrections. If a bubble is assigned
a different (or no) panel, its override is automatically reset, since it only
makes sense within its original group.

## Glossary

A project-wide list of important terms with a translation per language (like
`Bubble.text`) and an optional note — managed via a modal in the "Project" menu
on every screen (create, edit by clicking an entry, delete). As soon as a
glossary entry has a translation for the currently active language, every
occurrence of that translation is **highlighted directly in a bubble's or
curved text's text field** while typing — so the translator immediately sees
where an already-agreed term was used. Technically a transparent textarea over
a synchronously scrolling background div (not contentEditable — cursor,
selection, IME input, and undo therefore keep working natively unchanged). For
vertical (Japanese) text, highlighting is deliberately not shown — just a plain
textarea, since vertical text wrapping would need fundamentally different
special handling.

- **Furigana readings**: an entry can also store a reading per language,
  alongside its translation. Used by the bubble inspector's "Insert furigana"
  button (see [Speech Bubbles](#element-types)) — if the selected text
  matches a glossary translation with a stored reading, the reading is filled
  in automatically instead of left for the translator to type.

## Context View

A collapsible sidebar (toolbar icon, automatically closes the text list when
opened and vice versa — both dock in the same spot) showing information for
the currently selected bubble. Useful not just for translating — speaker,
reading order, and panel crop help just as much with pure lettering or writing:

- **Speaker** (including voice notes, if any) and the assigned **panel**.
- **Previous/current/next** bubble in reading order — with its own language
  selector, independent of the main language. At a page boundary, the
  neighboring page is **automatically preloaded** for this (only its layout,
  not the full editor view), so "previous"/"next" also works across pages; a
  click on it either selects the bubble (same page) or navigates to the
  neighboring page.
- Up/down buttons for the current bubble to correct the
  [reading order](#reading-order) within its group.
- An **image crop** of the current panel (cropped from the current page's
  source image, no neighboring-page images) — or a note if the bubble isn't
  assigned to a panel.

## AI Assistant

A collapsible chat sidebar (toolbar icon, same docking spot as Story Bible/
Context View) in the page editor and the script editor — a pure ask-only
assistant, no automatic changes to project data or tool-calling. The chat
history is purely client-side for the current session, not stored server-side.

- **Six interchangeable providers**, configured per account under "My Account"
  (`/account`, linked in the header). Only the providers actually configured
  appear as choices in the panel:
  - A self-supplied **OpenAI**, **Anthropic (Claude)**, **Google (Gemini)**,
    or **OpenRouter** API key — each stored encrypted on the server, never
    returned to the client in plaintext.
  - A **"Sign in with ChatGPT"** login via Codex (device-code flow — display a
    code + verification link, then confirm in a browser on any device).
  - A self-hosted **Ollama** server — just a base URL and a locally-installed
    model name (not a secret, no encryption). The URL must be reachable from
    the ComiKumi **server**, not the user's browser — for most setups that
    means the same machine or network as the server.
- **Codex runs as its own, long-lived server subprocess per account** with an
  isolated credentials folder (`server/data/codex-home/<account-id>`) —
  multiple accounts on the same ComiKumi server have separate ChatGPT logins
  and can never see each other. The process is terminated after a few minutes
  of inactivity and automatically restarted on the next question.
- **Context per question**: a "Include current page" checkbox controls whether,
  in addition to the question, the following is automatically sent along — in
  the page editor, a transcript of the current page (panels in reading order,
  speaker + text per bubble, effect/title texts) **plus the actual page image**
  (downscaled to max 1280px, so purely visual/dialogue-free panels can be
  described too); in the script editor, a transcript of the entire script
  document (composition, plot, dialogue per panel). Rebuilt on every question,
  so it always reflects the current editing state.
- Responses are **streamed** (Server-Sent Events) and rendered as Markdown
  (restricted: no raw HTML, only http(s) links).

## Script Editor & Script Sidebar

Two deliberately separate but data-linked tools for the planning phase before
actual lettering — plot, rough panel breakdown, image composition, and
multi-language dialogue text, independent of the later scanned page image and
its bubbles/panels.

### Script Editor (standalone screen)

- Exactly one script document per volume (`<volume><scriptSuffix>.json`, suffix
  configurable in settings, default `_script`), reachable via the "Script"
  entry in the "Project" menu of the page overview/editor.
- A page list (freely nameable label, notes field, movable/deletable), within
  it panels (size hint small/medium/large, image-composition and plot free
  text), within those dialogue lines (character dropdown including voice-notes
  display, stage direction, one text field per project language with glossary
  highlighting).
- A "Copy" button per dialogue line puts the text of the currently selected
  script language on the clipboard — the only bridge to the later page editor,
  deliberately without tighter coupling.
- Purely manual saving (no autosave), like the rest of the script
  functionality.

### Script Sidebar (in the page editor)

- A collapsible sidebar that links a real page to exactly one script page
  (`linkedPage`, set once, stored permanently in the script document — a
  structurally enforced 1:1 mapping).
- Full editing like in the Script Editor (add/move/delete panels/dialogue
  lines) right next to the canvas, plus an extra "Insert into bubble" button
  per dialogue line: with a bubble selected, a click writes the text directly
  into `bubble.text[active language]`, entirely without the clipboard detour.
  Without a selection, only the Copy button stays active.
- "Unlink" separates page and script page again without deleting its panels —
  in the Script Editor the script page remains unchanged, just without a link.

### Generating a Script from Already-Lettered Pages

Instead of filling in a script page by hand, it can be generated directly from
an already-lettered page — one panel per real panel (in reading order) plus a
collection panel for unassigned bubbles, each with one dialogue line per bubble
(character and text per language carried over 1:1). Image composition, plot,
and size hint cannot be derived from bubble data and stay empty, to be filled
in by hand.

- **Per page**: the "+ Generate from this page" button in the Script Sidebar
  fills the new linked script page directly from the bubbles of the currently
  open page.
- **For the whole volume**: the "Generate from lettered pages" button in the
  Script Editor generates, in one step, for **every** page with a saved
  lettering file that isn't yet linked to a script page — already-linked pages
  are skipped, to avoid overwriting manually added content (image composition,
  plot, notes).
- Both paths only change in-memory state — as everywhere in the script area,
  "Save" must be clicked deliberately afterward for it to land on disk.
- Effect (SFX) bubbles are skipped when generating dialogue lines this way —
  see [Speech Bubbles](#speech-bubbles).

## Review Comments

A standalone, per-volume-stored JSON document (`<volume><commentsSuffix>.json`,
suffix configurable in settings, default `_comments` — same pattern as the
script document), independent of the page layout — commenting never triggers
the translator diff guard, and "all open comments in the volume" is a single
request. Every project member from "viewer" up may read and comment — review/QC
is not a separate role concept, but exactly what "viewer" already means, plus
comment-write permission.

- **Three marker types** plus a general page comment with no location: **pin**
  (click), **box** (drag, like the panel tool), and **freehand** (a continuous
  scribble stroke, e.g. to circle/underline a spot). Markers can't be moved once
  created — only color/opacity change depending on status (open = solid,
  resolved = dimmed).
- **Threads**: every comment has replies, a resolve/reopen toggle, and can be
  deleted by its author or a project admin.
- **@-mentions** of individual accounts (autocomplete via a dedicated,
  non-admin-restricted `mentionable-members` route) or entire project roles
  (viewer/translator/letterer/admin — resolved against the current member list
  at send time, never stored as a snapshot). If the mentioned person has an
  email address on file, this triggers a notification email with a deep link
  back into the editor (`server/src/lib/mailer.ts`, SMTP entirely optional to
  configure — without `SMTP_HOST` it stays at the in-app marker, no error).
- **Sidebar**: all comments in the volume (not just the current page),
  filterable by open/resolved/"mentions me", jumps across pages via a
  `?comment=` deep link (same mechanism as the email links).

## Read/Review Interface

A dedicated, lean reading screen (`/volumes/:id/read/:page`, entry points: a
"Read" icon on every page card as well as a menu entry in the page overview)
for QC/review people who just want to conveniently look through a volume —
without the toolbar, inspectors, or undo/save mechanics of the full editor.
Technically the same canvas engine as the editor (`PageCanvas.tsx` in
`readOnly` mode), just with its own data loading directly via the API instead
of via the editor store, since layout data is never written here.

- **Free zoom/pan** like in the editor, plus **zoom to a specific panel**: a
  strip of clickable panel thumbnails at the bottom of the screen, sorted in
  reading order (same sort as reports/script sidebar) — clicking zooms the
  view exactly onto that panel.
- **Next/previous page** — arrow keys and buttons whose direction follows the
  configured reading direction (with "rtl" you page forward to the left, like a
  real manga reader). The actual page order stays unchanged, only which key
  means "forward" flips.
- **Characters, glossary, and script** in a single info panel, all read-only
  (no editing forms like in the full management dialogs — a viewer account
  couldn't call their write endpoints anyway). Glossary entries show every
  stored language at once; the linked script has its own language switcher.
- **Comment tools** (pin/box/freehand, see [Review Comments](#review-comments))
  are always directly visible in the toolbar — leave a note at any time,
  without an extra click.
- **Double-page spread view**: shows the current page together with its
  logical neighboring page side by side (auto-pairing, no cover special case),
  sorted by the configured reading direction — with "rtl" the earlier-read
  page sits on the right, with "ltr" on the left, like an actual open volume.
  Forward/back then pages by two pages instead of one.
- **Page comparison**: any freely chosen pages (up to four) can be opened side
  by side simultaneously via a thumbnail picker — each page independently
  zoomable/pannable, with its own panel zoom and own selection. Useful for
  e.g. placing an earlier page next to the current one as a style reference.
  Every displayed page has its own loading state, instead of blocking the
  whole interface on a switch.

## Reports

- **Page report**: four live-computed views for the currently open page — "who
  says what?" (every bubble in reading order with assigned character and
  text), the same grouped by panel ("who says what in which panel?", with a
  "no panel" collection for unassigned bubbles or bubbles referencing deleted
  panels), "which characters appear on the page?" (a unique character list),
  and "which characters appear in which panels?".
- **Volume report**: aggregates the same data across every *already-saved*
  page of the volume (pages never opened/saved are skipped) — which characters
  appear across the whole volume and on which pages, plus a page-by-page
  "who says what" overview with its own language selector.
- The page and volume reports share the same evaluation logic, so the two
  never use different definitions.
- Effect (SFX) bubbles are excluded from every report view — they're not
  dialogue, see [Speech Bubbles](#speech-bubbles).

## Export & Import

- **PNG export**: renders the page image plus all bubbles/images/curved texts
  of a chosen language onto a canvas and uploads the resulting PNG to the
  server, which stores it in the appropriately named export folder. Selectable
  page range (current page / all / even / odd / number range / custom list
  like `1,3,5,10-14`), a filter "only pages with a translation for this
  language" (skips pages with no content in the target language), and a
  language filter (all or just one). Progress is shown live.
- **Print export (TIFF, CMYK)**: an additional output format alongside PNG,
  selectable in the same export dialog (same page/language filter). Uses
  exactly the same rendered image as the PNG export — only the post-processing
  differs: the server converts it server-side (`sharp`) to CMYK and writes it
  as `.tiff` with a 300dpi resolution tag into the same language folder.
  Deliberately kept simple: **no pixel recomputation** (the resolution tag is
  pure metadata, a low-resolution scan is not artificially "sharpened") and
  **generic CMYK conversion** (no dedicated FOGRA/SWOP ICC profile) — doesn't
  solve the vector-text problem of professional print prepress (see
  `docs/Professional-Workflow-Gaps.md`), but makes the existing raster export
  print-capable in the first place (PNG technically has no CMYK color space).
- **CBZ export**: in the export viewer, the already-exported image set for a
  language can be downloaded as `.cbz` in addition to the existing ZIP download
  (a format recognized by comic readers like Komga/Kavita/ComicRack). Unlike
  the generic ZIP download, only page-image files are packed (no print
  TIFFs/PDFs/PSDs that happen to sit in the same folder), in true page order
  (via the volume's actual page list, not folder sorting), and consecutively
  renamed (`0001.png`, `0002.png`, …), so the order is correct regardless of
  the original filenames. `PageCount` is always computed from the actual
  number of packed pages, never supplied by the user.
- **CBZ metadata dialog** (`CbzMetadataModal.tsx`, schema in
  `shared/src/cbz.ts`): before the CBZ download, a modal asks for the complete
  ComicInfo.xml field set, grouped into five tabs — every field is optional, an
  empty field is simply omitted from the XML:
  - **Basics & series**: title, series, number, volume, summary, notes.
  - **Contributors**: writer, penciller, inker, colorist, letterer, cover
    artist, editor, translator.
  - **Publication**: publisher, imprint, year/month/day, web link, language
    (ISO, pre-filled with the code of the chosen export language).
  - **Categorization**: genre, tags, age rating (dropdown with the standard
    ComicInfo values), reading direction (the `Manga` field — dropdown
    "Automatic" takes over the project's reading direction, or explicit
    `Yes`/`No`/`YesAndRightToLeft`), format, scan information.
  - **Pages**: a table with one row per page actually to be exported (same
    filtering/order as server-side) — a selectable `Type` per page
    (`FrontCover`/`Story`/`BackCover`/…, first/last page pre-filled) and a
    `DoublePage` checkbox; produces the optional `<Pages>` block of the
    ComicInfo.xml.

  The download runs as a POST with a JSON body instead of a simple download
  link (the full field set including the page table could blow up a
  query-string download-link URL) — the response comes back as a blob and is
  saved via an object URL + synthetic click.
- **Layered PSD export**: one Photoshop layer per bubble/curved-text/placed
  image, plus background and Cut-Panel/retouch layers, ordered to match the
  editor's own [layer order](#layer-order-z-order). Every layer is a raster image you
  can hide/move/mask. An experimental, opt-in checkbox ("Editable text
  layers") additionally attaches a real, Type-tool-editable text object to
  bubbles that support it — plain rectangle/oval, horizontal, solid fill
  color, not merged with another bubble (vertical/Japanese text, gradient
  fills, quad bubbles, and merged bubbles keep their existing raster-only
  layer, since Photoshop's native text engine can't represent them). Such a
  bubble becomes two layers ("… (Background)" and "… (Text)") instead of
  one, since a Photoshop text layer can't also carry the bubble's own
  outline/fill. Off by default; Photoshop shows an "Update" prompt the first
  time it opens the text layer — accepting it converts it to live,
  retypeable text.
- **Rendering fundamentals**: shrink-to-fit + wrapping for horizontal text, a
  complete tategaki engine (forced line breaks, furigana runs, tate-chū-yoko
  digit/Latin runs, kana shrink/offset, kinsoku shori line-breaking rules),
  homography warping of text/image into an arbitrary quad, shared
  outline/tail drawing logic for bubble styles (identical between live preview
  and PNG export, so the two never drift apart), shared solid-color/gradient/
  outline drawing logic for text, SVG contour parsing (the largest
  bounding-box geometry is chosen if the SVG contains several).
- **JSON export/import** (page level): a single page's layout can be
  downloaded as JSON and imported again (validated against the Zod schema — a
  format error shows an error message instead of silently corrupting the
  page); replaces only the bubble array, not images/curved texts/panels.
- **JSON export/import** (volume level): all saved page layouts of a volume can
  be downloaded as one ZIP; conversely, a ZIP with layout JSONs can be
  imported (invalid/corrupted entries in the ZIP are individually skipped and
  reported, instead of aborting the whole import).

## Fonts

Custom font files (`.ttf`/`.otf`/`.woff`/`.woff2`) can be uploaded and are then
selectable per bubble/curved text via a dropdown. Fonts are registered once via
the browser's `FontFace` API and shared between the live preview and the PNG
export (both explicitly wait for the same loading process), so a font never
looks different in the preview than in the export. An internal counter ensures
bubbles are redrawn once the real font has loaded (instead of staying on the
initial fallback-font rendering).

## Project Asset Folder

Fonts, SVG bubble contours, and the image library live, by default, project-wide
together in a global library. In settings, a project-specific asset folder can
additionally be configured (analogous to the project folder, with a file
browser and existence check) — the tool automatically creates the `fonts/`,
`images/`, and `bubble-svgs/` subfolders within it.

- **Additive, not replacing**: the shared library remains visible/usable for
  every project even when a custom asset folder is configured. The project
  folder comes as an additional layer on top.
- **Filename collision**: if a file in the project folder has the same filename
  as one in the shared library, the project version wins — both in the listing
  (font/image/SVG picker) and when serving it.
- **Upload target**: new uploads automatically land in the project folder as
  soon as one is configured. If none is configured (the case for every project
  without this setting), everything behaves as before — purely global, no
  migration needed.
- The font/image/SVG picker show project-specific and shared entries in
  separate groups ("Project"/"Shared"), making it clear what's only available
  in this project.

**Folder management** (image library and SVG bubble contours, not fonts): both
libraries can be organized into arbitrarily deep subfolders (e.g. "Effects",
"Icons"), to find things faster as the collection grows.
- In the respective image/SVG picker popover, navigation through the structure
  is via breadcrumb + folder chips; clicking a folder chip jumps into it,
  "+ New folder" creates a new subfolder at the current level. A folder can
  only be deleted if it's empty **on both sides** (shared library as well as
  project-specific folder).
- An upload automatically lands in the currently open folder; already-existing
  files can be sorted afterward via a "Move to folder…" action on the
  respective image tile.
- An already-placed image/SVG contour remembers its full path (folder +
  filename) when inserted — if the file is later moved to a different folder,
  already-existing placements still point at the old path (no automatic
  updating of all references), just like moving a file in the filesystem while
  another document still knows the old path.

**Thumbnail folder** (cache of page thumbnails) is its own, independent
settings field — not a subfolder of the asset folder, since it's a pure
rendering cache rather than a curated asset. If left empty, the tool
automatically uses a `thumbnails/` folder right next to the project file,
instead of falling back to a shared global library (like fonts/images/SVGs) —
every project thus gets its own cache folder without further configuration,
regardless of whether an asset folder is set at all.

## Undo/Redo

A single history stack (max. 50 entries) of complete page-layout snapshots, for
all undo/redo operations. Discrete actions (add/remove element, delete/
duplicate selection) save a snapshot immediately; continuous actions (typing
text, dragging/scaling, arrow-key movement) are batched (600ms delay), so a
whole burst of activity becomes a single undo step (the state from *before*
the burst started), instead of one step per keystroke/pixel. Undo/redo clears
the current selection. Duplicating offsets copies by 24px, so they don't sit
exactly on top of the original.

## Server API

| Route file | Responsibility |
|---|---|
| `volumes.ts` | List detected volumes, including existing language folders |
| `pages.ts` | List a volume's pages, serve full-size + cached thumbnail image |
| `layout.ts` | Read/save a page layout (creates an empty one if needed), volume-wide ZIP export/import, `/reports` for the volume report |
| `comments.ts` | CRUD for [Review Comments](#review-comments) (granular mutation routes instead of whole-document PUT), `mentionable-members` for the @-picker |
| `export.ts` | Accept an uploaded PNG and store it in the export folder, download the export folder as ZIP or CBZ |
| `languages.ts` | CRUD for the project's language list, with conflict checking for duplicate codes/suffixes |
| `characters.ts` | CRUD for the project's character list |
| `glossary.ts` | CRUD for the project-wide glossary list |
| `presets.ts` | CRUD for the project-wide lettering preset list |
| `settings.ts` | Read/change project settings, including a live check of the scan root |
| `images.ts` | Upload/list/serve the image library, with dimension detection (merged global + [project asset folder](#project-asset-folder)) |
| `fonts.ts` | Upload/list/serve font files (merged global + [project asset folder](#project-asset-folder)) |
| `bubbleSvgs.ts` | Upload/list/serve custom SVG bubble contours (merged global + [project asset folder](#project-asset-folder)) |
| `browse.ts` | Server-side filesystem browser (drives, directory listings, optional `.json` filter) |
| `project.ts` | Query the current project, recently opened projects, open/create a project |

## Error Handling & Security

- **`asyncHandler`**: wraps every Express route handler so a thrown/rejected
  error in an async function actually reaches `next()` — otherwise the request
  would simply hang instead of returning a response.
- **Global error middleware**: a special "no active project" error becomes a
  409 response (so the client can redirect to the project switcher), everything
  else is logged server-side and answered with a generic 500 error.
- **Path-traversal protection**: every file-serving route (fonts, images, SVG
  contours) rejects filenames containing `..`, path separators, or a bare
  `.`/`..` name, before combining them with the fixed storage folder — a
  crafted filename therefore can't reach arbitrary other files. Uploaded
  filenames are additionally sanitized before being written.

## Tests

Vitest, currently 34 server + 4 client test files (345 + 78 tests, as of the
current code):

- **Server — route level** (`server/src/routes/*.test.ts`, via `supertest`
  against a real, temporary project/data-directory instance — never the real
  `server/data/` or real project data): a dedicated test file for practically
  every route file, including `volumes`, `pages`, `layout`, `export`, `script`,
  `comments`, `auth`, `project`, `characters`, `glossary`, `presets`,
  `settings`, `languages`, `fonts`, `images`, `bubbleSvgs`.
- **Server — lib level** (`server/src/lib/**/*.test.ts`): schema
  validation/default values (`sharedSchemas`, `layoutSchema`), path/folder-name
  templates and path-traversal checking (`paths`), rendering geometry and
  typography (`rendering/textLayout`, `rendering/verticalTypesetting`,
  `rendering/curvedText`, `rendering/bubbleBackground`, `rendering/perspective`,
  `rendering/cutPanel` — including the regression check that, when rendering a
  cut panel, all hole fills happen before all content drawing, see
  [Cut Panel](#cut-panel)), page rasterization (`pageRaster`), font resolution
  (`fontResolver`), vector PDF/PSD construction (`vectorPdf/buildPdfPage`,
  `psdExport`), the auth store, trash sweep (`trash`), and the optional mailer
  for comment @-mentions (`mailer`).
- **Client** (`client/src/**/*.test.ts`): pure geometry/selection/report logic
  shared by the live preview and export — `export/pageSelection` (page-range
  parsing), `editor/geometry`, `editor/reportUtils`, `state/editorStore`.

- **E2E** (`e2e/`, Playwright, its own package — not part of `npm test`): four
  core flows in a real browser against a dedicated, isolated server/client
  instance started for this purpose (its own ports 3101/4173, its own
  `LETTERING_DATA_DIR`/scan root under `e2e/tmp-run/`, provisioned once before
  the suite by `e2e/global-setup.ts` via the existing project API, not the UI)
  — UI login, opening a project via the project switcher, creating a
  bubble/setting text/saving (including a reload check that it actually
  persisted), triggering a PNG export (checked via both the UI message **and**
  the actual file on disk). Not full coverage of every feature — a foundation
  for the most important flows, on which further specs can be added in a
  targeted way (e.g. comments, cut panel, reader). See the README.md's "E2E
  tests" section for how to run it.
