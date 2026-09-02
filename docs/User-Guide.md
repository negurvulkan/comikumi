# ComiKumi — User Guide

*[Deutsche Version](User-Guide.de.md)*

*A task-oriented guide: how do I do X in ComiKumi? For the complete
technical feature reference, see [FEATURES.md](FEATURES.md).*

## Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Projects, Volumes, and Pages](#3-projects-volumes-and-pages)
4. [The Editor: Basics](#4-the-editor-basics)
5. [Creating and Editing Speech Bubbles](#5-creating-and-editing-speech-bubbles)
6. [Other Elements: Images, Curved Text, Panels](#6-other-elements-images-curved-text-panels)
7. [Japanese Typesetting](#7-japanese-typesetting)
8. [Editing Panel Content (Cut-Panel)](#8-editing-panel-content-cut-panel)
9. [Automatic Tools: Auto-Bubbles, Cleaning, AI](#9-automatic-tools-auto-bubbles-cleaning-ai)
10. [Working in Multiple Languages](#10-working-in-multiple-languages)
11. [Organization: Characters, Story Bible, Glossary, Presets](#11-organization-characters-story-bible-glossary-presets)
12. [Planning: The Script Editor](#12-planning-the-script-editor)
13. [Quality Control and Collaboration](#13-quality-control-and-collaboration)
14. [Export and Publishing](#14-export-and-publishing)
15. [Accounts, Roles, and Multi-User Operation](#15-accounts-roles-and-multi-user-operation)
16. [Settings and Customization](#16-settings-and-customization)
17. [Keyboard Shortcuts](#17-keyboard-shortcuts)

---

## 1. Introduction

ComiKumi is a tool for localizing and lettering manga/comics: you upload
scanned pages, place speech bubbles, translate them into any number of
languages, and export finished, print-ready pages — all locally, without
your data ever leaving a server you don't control yourself.

A typical workflow looks like this:

1. **Create a project** — a one-time step that points at a folder holding
   your scanned pages.
2. **Open a volume, upload pages** (or let ComiKumi detect scans already
   on disk).
3. **Letter a page** — draw speech bubbles (by hand or auto-detected),
   type or translate the text.
4. **Check it** — QA checks, comments/review, reports.
5. **Export** — as PNG, print-ready TIFF, vector PDF, layered PSD, or a
   finished CBZ.

This guide walks you through each of these steps. If you instead want to
know exactly *how* a feature works technically (e.g. which file gets
written where), read [FEATURES.md](FEATURES.md) — that's the complete
technical reference.

## 2. Getting Started

### 2.1 Installation

You have two options:

**A) Desktop app (easiest)**: if a ready-made installer was provided to
you (Windows/macOS/Linux), run it like any other application — ComiKumi
then starts as a normal program with its own window. All your project
data automatically ends up in a private folder under your user account,
not inside the install directory.

**B) Build it yourself from source (for developers/self-hosted
servers)**: requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

This installs both the client and server and starts them together (server
on port 3001, client on port 5173). Open the address printed in the
terminal in your browser. Want to build your own desktop installer? Use
`npm run electron:build` — see [README.md](../README.md) for details.

### 2.2 Creating Your First Account

On the very first launch (no account exists on this server yet), ComiKumi
shows a first-time setup screen instead of a login. Pick a username and
password — this first account automatically becomes **system
administrator** and can create further accounts later (see
[Chapter 15](#15-accounts-roles-and-multi-user-operation)).

### 2.3 Creating Your First Project

After logging in, you'll see the **project switcher**. Click "New
Project" — the **project wizard** walks you through five steps:

1. **Basics**: a name for the project, where to save the project file,
   and your **scan folder** — the folder your scanned pages live in (or
   will live in).
2. **Folder naming convention**: how ComiKumi names subfolders (e.g.
   `_empty` for untranslated raw scans, `_german` for the German
   version). The defaults work for most projects — adjustable if you need
   a different convention.
3. **Languages**: which languages you want to work in. You can add more
   later at any time — starting with a single language is fine if you're
   not (yet) working multilingually.
4. **First volumes**: optionally create one or more volumes/chapters
   right away — the wizard automatically creates the matching folders for
   you.
5. **Summary**: review and confirm — only now is the actual project file
   written.

If your scan folder doesn't exist yet, the wizard can create it directly.
A built-in file browser helps you navigate if you're unsure of the exact
path.

**Afterward**: your project is a single `.json` file bundling all
settings, languages, characters, and so on — so it's easy to copy, back
up, or share with others (the actual image files live separately in the
scan folder).

### 2.4 Opening an Existing Project

The project switcher shows a list of recently opened projects — one click
reopens them. Alternatively, use "Open Project" to point directly at the
path of a `project.json` file.

## 3. Projects, Volumes, and Pages

### 3.1 What Is a "Volume"?

A **volume** corresponds to a comic chapter/tankōbon — technically: a
folder ending in the configured "empty" suffix (e.g. `volume_01_empty`)
inside your scan folder. ComiKumi automatically searches your scan folder
for these; every matching folder appears as its own card in the volume
list.

### 3.2 Uploading Pages

Open a volume, then **Page → Upload Pages…**. You can upload one or more
page scans directly from your browser — handy once the client and server
aren't running on the same machine (otherwise you could also just copy
the files straight into the scan folder). If a file with the same name
already exists, ComiKumi asks before overwriting it.

**Deleting a page**: the "Delete" button on each page card only removes
the image file — it's non-destructively moved into a trash folder
(default retention: 30 days, configurable under project settings). A
lettering file already saved for that page (your bubbles/panels) is kept.

### 3.3 Creating a Blank Page

Instead of uploading a scan, you can also create a completely blank
(white) page at a size of your choosing via **Page → Blank Page…** —
useful when a page isn't built from one whole scan but assembled panel by
panel from separate, already-finished artwork (see
[Chapter 6.3](#63-panels) and the panel grid templates in the editor).

### 3.4 Chapters

Chapters are lightweight per-page tagging, nothing more — under **Page →
Manage Chapters** you create chapters, and every page card then gets a
dropdown to assign one. Benefits:

- The page overview visually groups pages by chapter.
- The export dialog gains a "Chapter" selection (exports only that
  chapter's pages).
- CBZ exports automatically get chapter bookmarks (works with readers
  like Komga/Kavita).
- The volume report and QA checker can be filtered by chapter.

Chapter *order* always follows the actual page order — you never set it
separately.

## 4. The Editor: Basics

Clicking a page card opens the **editor** — this is where the actual work
happens.

### 4.1 Navigating

- **Zoom**: mouse wheel (zooms toward the cursor), or the +/- buttons in
  the status bar.
- **Pan**: drag on empty space.
- **Select**: clicking an element selects it; Shift-click adds more
  elements to the selection. Clicking empty space clears the selection.

### 4.2 Editing Elements

Every selected element shows handles for moving/scaling/rotating.
Right-click opens a context menu (duplicate, delete, panel or character
assignment, depending on element type).

### 4.3 The Toolbar

Along the left edge you'll find tools for creating new elements (bubbles
in three shapes, effect bubble, image, curved text, panel), toggles for
the sidebars (text list, layers navigator, context view, Story Bible, AI
assistant, comments), and the automation tools (Auto-Bubbles, Clean Page
— see [Chapter 9](#9-automatic-tools-auto-bubbles-cleaning-ai)).

### 4.4 Saving

Nothing is written to disk automatically — actively click **Save** once
you're happy with an editing step.

**Important for teamwork**: if someone else has also saved the same page
in the meantime, a dialog appears when you save instead of a silent
overwrite — you then choose between "Keep My Version" or "Load Other
Version". More on this in
[Chapter 15](#15-accounts-roles-and-multi-user-operation).

### 4.5 Undo

**Ctrl+Z** undoes the last step, **Ctrl+Y** (or **Ctrl+Shift+Z**) redoes
it — up to 50 steps back. Continuous actions (e.g. while typing) count as
a single step, not one per keystroke.

## 5. Creating and Editing Speech Bubbles

### 5.1 Drawing a Bubble

Pick a shape in the toolbar (rectangle, oval, or "quad" for freely
warpable perspective, e.g. a sign seen at an angle) and drag out a
rectangle on the canvas — that becomes the new bubble.

### 5.2 Typing Text

Open the **text list** (toolbar) or click directly on the bubble and use
the inspector on the right. Type your text — with multiple project
languages, switch which one you're editing via the **language strip**
(next to the text sidebar).

### 5.3 Adjusting the Look

In the selected bubble's inspector you can set:

- **Background style**: none (invisible overlay on existing art), speech
  bubble, thought bubble, effect (jagged edge), or your own uploaded SVG
  outline.
- **Fill/stroke color, stroke width.**
- **Tail** (for visible styles): seamless, detached, or a segmented
  "chain" — position, width, and curve are all draggable directly on the
  canvas.
- **Text**: font, size, line height, alignment, reading direction, color,
  optionally an outline or gradient.

### 5.4 Effect Bubbles (SFX)

For sound effects/onomatopoeia there's a dedicated tool right next to the
three shape tools — it draws a bubble just like the rectangle tool, but
additionally marks it as a sound effect instead of spoken dialogue. An
existing bubble can be switched into this mode later via a checkbox in
the inspector. Effect bubbles are automatically excluded from "who says
what" reports, auto-generated script dialogue lines, and the "missing
translation" QA check — none of those make sense for a sound effect.

### 5.5 Clipping Bubbles

Want a bubble to end cleanly at a panel edge? Use the **"Clip"** button in
the inspector — drag the clip line freely on the canvas, or click
**"Snap to Panel Edge"** for an automatic suggestion. A "Flip" toggle
reverses which side is kept. Text automatically pulls back from the
clipped edge so it never runs into it.

### 5.6 Merging Bubbles

To merge several bubbles into one continuous shape (e.g. two overlapping
ovals into a figure-eight): select all the bubbles involved with
Shift-click, then click **"Merge Bubbles"** in the multi-select
inspector. The first-selected bubble then carries the shared text.
**"Unmerge"** restores every original bubble with its own previous text —
nothing is lost in the process.

### 5.7 Fine-Tuning: Padding and Line Wrapping

- **Padding** (gap between the bubble outline and the text): a checkbox in
  the inspector lets you set your own value via a slider instead of the
  automatic default — handy when a translation looks especially cramped
  or loose.
- **Shape-aware line wrapping** (oval bubbles only): a checkbox lets each
  line derive its width from the bubble's actual ellipse shape instead of
  a fixed rectangle — useful for translations with a lot of text.

## 6. Other Elements: Images, Curved Text, Panels

### 6.1 Placed Images

The image tool lets you insert a raster image that can be freely warped
into a quad (the same mechanism as "quad" bubbles) — for things text
alone can't cover, such as a newly drawn sign. You can assign a different
image file per language.

### 6.2 Curved Text

For free-standing title/effect text along a curve (e.g. a logo-style
chapter title or "BOOM!" along a motion line) — the curved text tool
places four draggable control points, and the text automatically follows
the resulting curve.

### 6.3 Panels

Panels are pure editor annotations that mark a comic panel — they
**never** appear in PNG export, but serve as the basis for "who says what
in which panel" reports and automatic reading order. Draw them with the
panel tool; double-clicking the outline adds another corner point,
right-clicking a point removes it again.

For panel-by-panel construction of a [blank page](#33-creating-a-blank-page),
the toolbar offers a **panel grid menu** with common templates (1
panel/full page, 2/3 stacked, 2×2, 2×3) — creates several evenly
distributed panels at once, each already set up for
[Cut-Panel](#8-editing-panel-content-cut-panel): just click and assign
the finished panel artwork.

### 6.4 Locking

Every element can be individually locked (small lock icon at the corner
of the selected element) — locked elements can no longer be moved/
deleted/duplicated, but text remains editable. Handy for avoiding
accidental slips.

For many elements at once: the **layers navigator** (toolbar) lists
everything grouped by panel and offers lock/unlock for whole groups or
the current multi-selection.

### 6.5 Layer Order

Bubbles/images/curved text are drawn in a fixed order by default — the
layers navigator ("Bring to Front"/"Send to Back") or the right-click menu
lets you change this for individual elements, e.g. so an image patch sits
in front of a bubble instead of behind it.

## 7. Japanese Typesetting

For vertical Japanese text (tategaki), set a bubble's **reading
direction** to "vertical" — the text then automatically flows top to
bottom, columns right to left.

### 7.1 Furigana

Small reading-aid characters above/beside kanji: type `{漢字|かんじ}`
directly into the text, or select text and click the toolbar button
**"Insert Furigana"** — it inserts the syntax automatically and, if a
matching reading is stored in the [glossary](#114-glossary), suggests it
right away.

Two variants:
- **Group furigana**: one reading spread evenly across several
  characters, e.g. `{大人|おとな}`.
- **Mono-ruby**: its own reading per individual character, e.g.
  `{東|とう}{京|きょう}` — two or more such blocks written directly one
  after another automatically stay together as one word, even across a
  column break.

### 7.2 Bōten (Emphasis Dots)

The Japanese equivalent of bold/italic: select text and click **"Insert
Bōten"**, or type `{最悪*}` directly — draws a small dot next to each
marked character.

### 7.3 Tate-chū-yoko

Runs of digits or Latin letters (e.g. "21") are automatically shown lying
sideways in vertical text instead of rotated character by character — this
happens automatically, no special syntax needed.

## 8. Editing Panel Content (Cut-Panel)

Any drawn panel can additionally be upgraded to a **Cut-Panel** in the
panel inspector (button "Activate Cut-Panel for '{language}'"). This lets
you, with no external graphics program at all:

- **Move the panel content** — e.g. for a right-to-left (Japanese
  original) to left-to-right (Western version) rework, or to correct a
  slightly misaligned panel.
- **Remove the content** — the panel disappears entirely from the preview
  and export, non-destructively (reversible at any time).
- **Replace the content with your own image** — e.g. to swap out
  incorrect artwork or satisfy a censorship requirement.

Important: **none of this changes your original scan file** — everything
happens only at render time (preview and export).

### 8.1 Activation: All Languages or Just One

- **"Activate for all languages"**: sensible when the panel content is
  language-independent (e.g. when building a blank page panel by panel).
- **"Activate Cut-Panel for '{language}'"**: affects only the currently
  active language — e.g. a sign that only needs localizing in the German/
  English version, while the Japanese original stays unchanged.

### 8.2 Image Replacement in Detail

For "Replaced with own image", pick a file through the same dialog used
for placing an image — per language individually. A **"Fit"** toggle
determines whether the image is stretched or fit while preserving aspect
ratio (with empty space on the shorter edges). Optionally you can add a
border (color + width) that also appears in the PNG export.

You can additionally **flip the shown content horizontally** — per
language, handy for adapting a direction of motion to a changed reading
direction.

## 9. Automatic Tools: Auto-Bubbles, Cleaning, AI

### 9.1 Auto-Bubbles: Detecting Speech Bubbles Automatically

Instead of drawing every bubble by hand, click **Auto-Bubbles** in the
toolbar. The tool runs entirely in your browser (no data leaves it) and
works in two steps:

1. Automatically finds every likely speech-bubble area on the page.
2. Reads the text inside each detected box automatically.

**Important**: the text-recognition step only works for **Japanese**
source text — for any other language the text stays empty or meaningless,
but the plain position-detection step (step 1) remains useful on its own.

A **review panel** then appears: you can accept, correct, or reject each
detected region individually. Only clicking "Insert" actually turns the
selected regions into real bubbles — nothing happens automatically
without this confirmation.

The models download on first use (some waiting time), then stay cached in
the browser.

### 9.2 Clean Page (Removing Text from the Original)

Want to remove the original printed text from a speech bubble and
reconstruct the artwork underneath (e.g. to make room for a clean new
translation)? Click **"Clean Page"** in the toolbar. Steps:

1. **Detection**: the same detector as Auto-Bubbles finds text regions.
2. **Mask editor**: the detected regions (marked in red) appear for
   review. The detector only marks the *text*, often not the whole bubble
   including its tail — here you can:
   - **move** existing regions (click and drag on the region),
   - **resize** from the **corner** (small drag handle),
   - **delete** unwanted regions with **×**,
   - **draw new regions** on empty space (click and drag) — e.g. for a
     tail or SFX lettering the detector missed.

   This also works when automatic detection found nothing at all — you
   then mark everything by hand.
3. Click **"Continue"** — the server reconstructs the image (this can take
   anywhere from seconds to several minutes, depending on how many
   regions there are and your server's hardware).
4. **Before/after comparison**: review the result, click **"Apply"** if
   it looks right.

**Important**: none of this alters your original scan. Applying only
flips a per-page switch ("use cleaned image"), which you can turn off
again at any time in the blue banner above the canvas ("Restore
original").

**Quality expectations**: the reconstruction model is generally trained,
not specifically on manga — it works well on simple, flat speech-bubble
backgrounds, but complex hand-drawn backgrounds (e.g. behind large SFX
lettering) can show visible blur/artifacts. The mask editor makes sure
the *right area* gets reconstructed — reconstruction quality itself is a
limit of the current model.

### 9.3 AI Assistant

Open the chat sidebar via the toolbar. Before you can use it, at least one
AI provider must be set up under **"My Account"** (your own API key for
OpenAI/Anthropic/Google/OpenRouter, a "Sign in with ChatGPT" connection
via Codex, or a self-hosted Ollama server).

Mostly, the assistant just answers questions about the current page
(optionally including the page image as context — checkbox "Include
current page"). It also understands ten specific requests — e.g. type
**"Translate all missing German bubbles"**, "Fix the bubbles that overflow",
"Assign characters to these lines", "Style the SFX bubbles", "Check the
reading order", "Suggest glossary terms for this page", "Fix glossary usage
here", or "Suggest a translation note" — and if the current page actually
has something matching, it replies with a review panel (per-item
accept/edit/reject) instead of a chat message. From the pages overview, a
second AI panel additionally understands "Suggest a chapter breakdown" and
"Suggest page types" for the whole volume. As everywhere: nothing is applied
until you actively confirm it.

## 10. Working in Multiple Languages

### 10.1 Managing Languages

Add or remove languages via the language strip in the editor (the "+"
chip) or Project → Settings. Every language has a code (e.g. `de`), a
display label, and a folder suffix for export.

### 10.2 Language-Specific Overrides

Almost every text/style field of a bubble (font, size, alignment, reading
direction, color, …), as well as its complete shape/position, can be
**overridden per language** via a small toggle right next to the field —
e.g. Japanese set to vertical with one font, while German/English stay
horizontal and use a different font. A particularly long translation can
even get its own, larger bubble shape this way, without affecting the
other languages.

### 10.3 UI Language vs. Project Languages

Don't confuse the two: the **interface** (menus, buttons) can be displayed
in seven languages via the switcher in the top right — completely
independent of which languages your *project content* (the comic's
dialogue itself) is translated into.

## 11. Organization: Characters, Story Bible, Glossary, Presets

### 11.1 Characters

Under **Project → Characters** you build your cast list: name, color, and
**voice notes** (free text on speech patterns, personality, catchphrases
— your "character voice bible"). Assign a character to a bubble in the
inspector or via right-click — renaming, recoloring, or updating notes
then automatically applies everywhere, without touching every page
individually.

### 11.2 Story Bible

For broader worldbuilding (locations, objects, factions, not just
characters) there's a dedicated area under **Project → Story Bible**:
free-form entries with type, description, notes, reference images, and
relationships between entries (e.g. "is sister of"). Characters in the
Story Bible are the exact same records as under "Characters" — no
duplicate upkeep needed.

### 11.3 Lettering Presets

Reusable style templates (e.g. "SFX Style", "Narration Style") — manage
them under **Project → Presets**. Assign one to a bubble/curved text in
the inspector; if you then change the preset itself, every linked element
updates instantly. A preset can deliberately define only some fields (e.g.
just the font) — the rest stays up to the individual bubble.

A small **starter library** ("Manga SFX", "Whisper", "Shout") can be
added as a copy into your project with one click.

### 11.4 Glossary

Under **Project → Glossary** you maintain important, recurring terms with
a translation per language and an optional note. Once a term has a
translation for the currently active language, every occurrence of it is
**highlighted directly as you type** — so you immediately see where an
already-agreed term was used. An entry can additionally store a furigana
reading (see [Chapter 7.1](#71-furigana)).

## 12. Planning: The Script Editor

For the planning phase *before* actual lettering (plot, rough panel
breakdown, multi-language dialogue text), there's a dedicated screen
under **Project → Script** — independent of the later scanned page image.

- Create script pages, containing panels (with composition/plot notes),
  containing dialogue lines (character, direction note, text per
  language).
- A **"Copy"** button on each dialogue line puts the text on the
  clipboard.
- In the editor itself there's also a **script sidebar**: link a real
  page to a script page, then clicking "Insert into Bubble" writes the
  text directly into the selected bubble — no clipboard detour needed.
- Conversely, a script skeleton can be auto-generated from already-lettered
  pages (button "Generate from Lettered Pages") — handy if you only start
  script planning later.

## 13. Quality Control and Collaboration

### 13.1 Reading Order

ComiKumi automatically determines the order in which bubbles are read
(based on panel position and the configured reading direction). If that
doesn't match in a specific case, correct it via the up/down buttons in
the **context view** (toolbar) for the selected bubble.

### 13.2 Context View

This sidebar shows, for the selected bubble: speaker (incl. voice notes),
assigned panel, the previous/next bubble in reading order (even across
page boundaries), and a cropped image of the panel. Useful when
translating as well as when purely lettering.

### 13.3 Reports

Via the **"Report"** menu you see, for the current page: "who says what?",
the same grouped by panel, and a character list. A **volume report**
aggregates the same across every already-saved page of the volume.

### 13.4 QA Check

The QA checker (in the volume report area) automatically checks for:

- **Missing translations**: a bubble has text in at least one language
  but not in another.
- **Duplicate presets**: two presets with the same name.
- **Unused glossary terms**: a glossary term appears in the source text,
  but its translation apparently wasn't used.

Click a finding to jump straight to the affected bubble.

### 13.5 Review Comments

Team members with the "Viewer" role or above can comment, with no editing
rights on the layout at all. Three marker types are available:

- **Pin** (a single click on a spot),
- **Box** (dragged rectangle),
- **Freehand** (a scribble stroke for circling/underlining).

Every comment has a thread with replies and a resolved toggle. Use
**@Name** or **@Role** (e.g. `@letterer`) to mention someone specifically
— if that person has an email address on file, they automatically get a
notification with a link straight to the spot.

### 13.6 Reader/Review Interface

For plain read-through (no editing tools) there's a dedicated, lightweight
**reading screen** — icon on every page card. Handy for QC people: free
zoom/pan, jump to a specific panel, spread view, up to four pages open
side by side for comparison, plus the same comment tools as in the
editor.

## 14. Export and Publishing

The **Export** menu (page overview or editor) offers several formats —
each with a choice of which pages (current/all/chapter/custom range) and
which language(s) to export:

- **PNG**: the fully rendered page as an image file.
- **Print TIFF (CMYK)**: the same image, additionally prepared for print
  (CMYK color space, 300dpi metadata).
- **Vector PDF**: print-ready PDF with real, crisp vector text instead of
  rasterized letters.
- **Layered PSD**: a Photoshop file with its own layer per bubble/image/
  curved text — handy for further editing. Optionally (checkbox
  "Editable text layers") with real text you can keep typing in Photoshop
  instead of a plain raster image (works for simple, horizontal,
  non-merged bubbles).

In the **export viewer** (after an export) the folder can additionally be
downloaded as a **ZIP** or as a **CBZ** — CBZ with its own dialog for
ComicInfo.xml metadata (title, contributors, genre, age rating, reading
direction, per-page info like cover/double-page).

**Page layout as JSON**: individual pages or a whole volume can be
exported as JSON (or a ZIP full of JSON files) and re-imported — e.g. for
a backup, or to move layouts between projects.

## 15. Accounts, Roles, and Multi-User Operation

### 15.1 Roles

Within a project there are four tiers, each with the previous tier's
rights plus more:

- **Viewer**: read-only, can comment.
- **Translator**: additionally edit bubble text and the glossary (no
  geometry tools).
- **Letterer**: full editing — layout, panels, presets, export, font/
  image/SVG upload.
- **Admin**: additionally project settings and this project's member
  management.

A **system administrator** (a server-wide account flag) always has full
access to every project, regardless of its member list.

### 15.2 Managing Members

Under **Project → Members** (visible from the Admin role up) you add
people to the project and set their role. Server-wide accounts themselves
are managed under **Project → Accounts** (system administrators only).

### 15.3 Working Simultaneously

Several people can work on the same project at the same time:

- **Conflict detection on save** (see [4.4](#44-saving)) — prevents
  silent overwrites.
- **Warning on project switch** — if someone else was active in the last
  five minutes, ComiKumi asks before switching.
- Multiple **browser tabs** can even have different projects open at the
  same time.

## 16. Settings and Customization

### 16.1 Project Settings

Under **Project → Settings**: description, scan root folder, folder
naming convention, reading direction (determines the automatic reading
order for the whole project), an optional project-specific assets folder
(see below), and trash retention duration.

### 16.2 Custom Fonts, Images, and Bubble Outlines

Under the respective picker dialogs (font in the bubble inspector, image
tool, SVG bubble outline) you can upload your own files — they're then
available project-wide. By default they land in a shared, machine-wide
library; project settings let you additionally set a **project-specific
assets folder** (handy if you maintain several independent projects with
different font licenses, for instance). The image and SVG libraries can
be organized into subfolders to stay manageable as your collection grows.

### 16.3 UI Language

Switcher in the top right of the app header — affects only the interface
itself, see [10.3](#103-ui-language-vs-project-languages).

## 17. Keyboard Shortcuts

| Shortcut | Effect |
|---|---|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+D | Duplicate selection |
| Escape | Clear selection |
| Delete / Backspace | Delete selection |
| Arrow keys | Move selection by 1 px |
| Shift + arrow keys | Move selection by 10 px |

Keyboard shortcuts are disabled while a text field is focused (so, for
example, Ctrl+Z while typing affects the text editor, not the layout).

---

*Missing something in this guide, or is a description unclear? Let us
know — this document is updated continuously as new features land.*
