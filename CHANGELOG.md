# Changelog

All notable changes to ComiKumi are documented in this file. Entries summarize
capabilities reached at each version rather than a per-commit history — the
project didn't tag intermediate versions before 0.6.0.

## [0.7.0] — 2026-09-04

### Bubble & text styling
- Gradient fill, glow, and drop shadow for a bubble's background and for text (bubble
  text and curved text), independently toggleable and stackable.
- Bevel & Emboss for bubble backgrounds — inner/outer/emboss styles, an up/down
  direction flipping raised-vs-recessed, and adjustable angle/size/softness/
  highlight+shadow color and opacity.
- Dashed/dotted/custom border patterns for bubble backgrounds — a preset dropdown
  (solid/dotted/dashed/dash-dot/long dash) plus a custom numeric dash-pattern field
  with a phase offset, applied consistently to the main body, free-standing tails,
  and chain-tail segments.
- All of the above are assignable per bubble/curved text or bundled into a reusable
  Lettering Preset, alongside the existing text outline/gradient fields.

## [0.6.0] — 2026-09-03

First versioned snapshot. Highlights of what ComiKumi can do at this point:

### Lettering & typesetting
- Multi-language lettering with per-language field overrides and shared-value fallback.
- Full vertical Japanese typesetting (tategaki): forced line breaks, group/mono-ruby
  furigana, bōten emphasis dots, automatic tate-chū-yoko, kinsoku shori line-breaking.
- Four element types: speech bubbles (rect/oval/free perspective quad), placed images,
  curved title/SFX text along a Bézier path, and panel-reference polygons.
- Balloon-aware line-breaking for oval bubbles.
- Bubble clipping (flush against a panel edge) and non-destructive bubble merging.
- Effect (SFX) bubbles, distinct from dialogue in reports/exports/QA checks.
- Lettering presets with live-updating linked elements.
- Layer order (z-order) and a Layers/Panel navigator with bulk locking.

### Automation & AI
- Auto-Bubbles: client-side bubble detection + OCR (WebGPU/WASM), review-gated.
- Cleaning (Inpainting): removes original printed text under a mask and reconstructs
  the artwork, with rectangle, freehand, polygon, and add/remove brush mask tools.
- AI assistant with ten review-gated actions (translate, fix overflow, assign
  characters, style SFX, fix reading order, extract/fix glossary terms, draft a
  translation note, suggest chapters, suggest page types), six swappable providers.
- Import Clip Studio Paint (.clip) files directly as pages.

### Project & team workflow
- Context view, project glossary, and "who says what" reports.
- Script planning (standalone volume-wide script editor linked to real pages).
- Project-specific asset folders (fonts, SVG contours, image library).
- Review & QC comments with @-mentions and optional email notifications.
- Workflow status board (Cleaning/Translation/Lettering/QC per page and language).
- Read/Review viewer with zoom-to-panel and multi-page comparison.
- Chapters, with CBZ chapter bookmarks and volume report/QA grouping.
- Multi-user safety: optimistic save-conflict detection, serialized metadata writes.

### Export
- PNG, print (CMYK TIFF), vector PDF/PSD, and CBZ export with page-range/language
  filtering, JSON layout import/export, and a full ComicInfo.xml metadata dialog.

### Deployment
- Desktop installer (Windows NSIS, macOS `.dmg`, Linux `.AppImage`) via Electron,
  embedding the same Express server used in the web deployment.
- First-run setup wizard choosing a local server (data directory, port) or a remote
  ComiKumi server, revisitable via **Datei → Server wechseln…**.
- Local-first web deployment: a small Express server reads/writes files on disk, no
  cloud, no accounts, no telemetry.
