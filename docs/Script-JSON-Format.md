# Script JSON Format

*[Deutsche Version](Script-JSON-Format.de.md)*

A volume can optionally have a script file (`<volume><scriptSuffix>.json`, default
suffix `_script`, e.g. `Volume_01_script.json`, configurable via Project →
Settings) — plot, rough panel breakdown, image composition, and multilingual
dialogue text for the planning phase, independent of the later-scanned page image
and its speech bubbles/panels (see [FEATURES.md → Script Editor & Script Sidebar](FEATURES.md#script-editor--script-sidebar)).
Unlike the [page layout](JSON-Format.md), there is **no pixel geometry** here —
a script page doesn't need an image to exist.

The schema is defined in [`shared/src/script.ts`](../shared/src/script.ts) as a
[Zod](https://zod.dev) schema; this file describes it in prose. A
machine-readable JSON Schema (draft-07, generated from the same Zod schema) lives
at [`script.schema.json`](script.schema.json) — suitable for handing directly to
an AI as a structured reference (see below, "For AI-assisted generation").

## Basic structure (`ScriptDocument`)

```jsonc
{
  "pages": [ /* ScriptPage[] */ ]
}
```

An empty document is `{ "pages": [] }` — exactly what `GET .../script` returns
when no script file has been saved yet for the volume.

## ScriptPage

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | – | unique ID (uuid) |
| `label` | string | `""` | Display name of the page. Empty = automatic numbering ("Page N" by array position) |
| `notes` | string | `""` | Free-text note field for the whole page |
| `panels` | `ScriptPanel[]` | `[]` | The panels of this script page, in narrative order |
| `linkedPage` | string \| `null` | `null` | Name of an actual scanned page (e.g. `"page_03"`) that this script page is linked to via the script sidebar. `null` = not yet linked — the default case for every page newly created in the script editor |

## ScriptPanel

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | – | unique ID (uuid) |
| `sizeHint` | `"small" \| "medium" \| "large"` | `"medium"` | Rough size indication for later layout planning — purely informational, has no pixel effect |
| `composition` | string | `""` | Image composition — what's visible in the panel, camera angle/framing |
| `action` | string | `""` | Action — what happens in this panel |
| `dialogue` | `ScriptDialogueLine[]` | `[]` | Dialogue lines of this panel, in speaking order |

## ScriptDialogueLine

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string | – | unique ID (uuid) |
| `characterId` | string \| `null` | `null` | Reference to an entry of the project-wide [character management](FEATURES.md#character-management) (`type === "character"` in the Story Bible). `null` = no speaker assigned; a stale/deleted ID is treated like `null` |
| `text` | `Record<LanguageCode, string>` | `{}` | Dialogue text per project language — same structure as `Bubble.text` in the page layout, see [JSON-Format.md → Bubble](JSON-Format.md#bubble). If a language code is missing, the text is considered not yet translated for that language |
| `note` | string | `""` | Free-form direction, e.g. `"off-panel"`, `"mumbled"` |

## For AI-assisted generation

This schema is well suited for handing to an AI together with an unformatted
plain-text script to generate a valid `ScriptDocument` from it — unlike the
page layout, no panel/bubble geometry needs to be estimated, only the content
structure (page → panel → dialogue line). Suggested workflow:

1. Give the AI `script.schema.json` (or this file) as context, along with the
   list of language codes already set up in the project (see
   [Language management](FEATURES.md#language-management)) and characters
   (name → `id`, from [character management](FEATURES.md#character-management)).
2. The AI generates `ScriptDocument` JSON with `linkedPage: null` (no actual
   page exists yet) and `text` fields only for the source language —
   translations can be added afterward either in the script editor itself or
   in a second AI pass (see below).
3. The result can be validated by checking it against `script.schema.json`
   before it is saved via `PUT /api/[p/:projectId/]volumes/:id/script` — the
   same route the script editor uses when saving, including
   `ScriptDocumentSchema.safeParse()` validation server-side
   (`server/src/routes/script.ts`).

The same pattern also works for **translations**: hand an existing
`ScriptDocument` or [`PageLayout`](JSON-Format.md) file, together with the
desired target language codes, to an AI, which then fills in missing entries
in the respective `text` records without changing structure, IDs, or already
existing translations.
