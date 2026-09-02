# .clip (Clip Studio Paint) importer provenance

Recorded for the .clip-import feature (`server/src/lib/clipImport.ts`) — must stay
accurate; update if the extraction approach ever changes.

## Why this exists

.clip is Clip Studio Paint's proprietary project file format. There is no official
specification from Celsys — everything below was independently reverse-engineered this
session against real CSP output and cross-checked with community reverse-engineering
projects used purely as reference documentation, not as copied code.

## Reference sources consulted

- [github.com/Inochi2D/clip-d](https://github.com/Inochi2D/clip-d) — `SPEC.md`, a
  partial, admittedly-incomplete community write-up of the chunk container format. No
  license file (documentation only, not a code dependency).
- [github.com/LavenderSnek/clipdecode](https://github.com/LavenderSnek/clipdecode) —
  **LGPL-2.1**, Rust. The most detailed reference found: its `src/chunk.rs`,
  `src/exta/offscreen.rs`, `src/sql/*.rs`, and `assets/*.clip` test fixtures were read
  to understand the chunk byte layout and SQLite table/column names. LGPL-2.1 is
  AGPL-3.0-compatible (one-way, into the stronger copyleft), so this would not have
  blocked reuse even if code had been copied — none was; `server/src/lib/clipImport.ts`
  is an independent re-implementation, informed by reading this repo's structs as
  documentation of the format, same as reading a spec.
- [github.com/Aodaruma/clipfile-rs](https://github.com/Aodaruma/clipfile-rs) — **MIT**,
  Rust. The most feature-complete parser found (layer tree, raster tiles, vector
  strokes, `CanvasPreview` extraction) — its README's own documented gap
  ("no full-fidelity vector-brush rendering... coverage of the full format is still
  incomplete") matches exactly what this session hit independently (see below). Not
  used as a code or structural reference beyond that README — MIT would have permitted
  reuse either way.
- [github.com/dobrokot/clip_to_psd](https://github.com/dobrokot/clip_to_psd) — MIT,
  Python. Considered and **rejected as an implementation path** (not a license
  rejection): using it would mean shelling out to Python, a runtime dependency the
  server doesn't otherwise have — inconsistent with this project's "no dev tooling
  required for an end user" packaging goal (see the Electron-installer work earlier
  this session). Not read for structural reference either; TypeScript-native
  reimplementation was preferred throughout.

**License compatibility**: not a blocker at any point. LGPL-2.1 and MIT are both
AGPL-3.0-or-later-compatible. The actual constraint on this feature was the format's
own undocumented complexity, not licensing.

## Verified: the container format and SQLite schema

Confirmed against both `clipdecode`'s public 24x24px test fixtures and real files
created in CSP by the user during this session (a 148x210mm/350dpi ≈ 2039x2894px test
page, later a minimal single-layer test file):

- `CSFCHUNK` (file start) → `CHNKHead` (via a file-offset pointer, not sequential
  scanning) → `CHNKSQLi`, whose body is a **complete, standalone SQLite database file**
  — openable directly, no further decoding needed for the metadata inside it.
- `CanvasPreview.ImageData` is a **ready-made, standalone PNG** (verified via its own
  `\x89PNG\r\n...` magic bytes) — CSP's own flattened render of the canvas.
- `Canvas.CanvasWidth`/`CanvasHeight` are stored in whatever unit `CanvasUnit` says
  (commonly millimetres, not pixels) — real pixel dimensions need converting through
  `CanvasResolution` (dpi). Verified: a real 148x210mm/350dpi file → 2039x2894px,
  matching the file's own reported "350dpi" exactly.
- `Layer.LayerVisibility` is a **bitmask**, not a boolean — a real file had value `3`
  (bits 0+1 set) for a genuinely visible layer. An earlier equality check
  (`=== 1`) silently misread this as hidden and dropped an entire layer subtree from a
  first draft of the layer-tree walk; fixed by checking bit 0 only
  (`& 1`), matching the existing bitmask pattern already seen on `LayerLock`
  (`lock & 1`, `lock & 16`) in `clipdecode`'s reference code.

## Investigated but not shipped: full-resolution layer compositing

A second extraction strategy — compositing each visible layer's own raw pixel tiles at
the canvas's real resolution, instead of using the capped-resolution embedded preview —
was investigated in depth (multiple real test files, including ones the user created
specifically to isolate variables: a multi-layer page, then a single-raster-layer-only
file). Verified along the way:

- The chunk container for a layer's pixel data (`Offscreen` → `BlockData` → an
  `ExternalChunk`-looked-up file offset → a `CHNKExta` chunk containing a list of
  length-prefixed `BlockDataChunk`s, one per 256x256 tile) parses reliably and
  consistently — tile grid size matches `ceil(canvasWidth/256) × ceil(canvasHeight/256)`
  exactly (verified: 8×12=96 tiles for a 2039x2894px canvas).
- Not every layer with a plausible `LayerType` actually has real tile bytes on disk —
  a genuinely-raster, visibly-filled test layer showed **completely empty tile blocks**
  across its entire mipmap pyramid even after a full CSP close/reopen, while a second,
  minimal single-layer test file (created specifically to rule out confounds from
  folders/multiple layers) reliably had real data. Root cause not established — CSP
  appears not to always flush a layer's raster edits into the saved file's tile chunks.
- A layer drawn with CSP's pen/pencil tool (`LayerType=0`, "Other") had entirely empty
  tile blocks too — its content lives in `VectorObjectList` vector-stroke geometry
  instead, which would need real brush rendering to reconstruct. This is the exact gap
  `clipfile-rs` documents as unsolved even in the most complete public parser. A later
  technical write-up on the format (an independent research document the user supplied)
  corroborates this directly: *"Ältere Formatrevisionen sicherten zur Beschleunigung des
  Renderings stets eine parallel berechnete Rasterkopie dieser Vektoren in den
  CHNKExta-Blöcken. Neuere Versionen verwerfen diese vorgerenderten Pixelpuffer
  zunehmend"* — newer CSP versions increasingly stop caching a rendered copy of vector
  strokes at all, confirming this isn't a parsing bug on this project's side.
- **Blocking finding**: for a tile that genuinely does have real, persisted pixel data
  (a fully solid-color-filled raster layer — the simplest possible case, no boundary,
  no anti-aliasing, no gradient), the decompressed bytes do **not** match any tested
  plane/channel-layout hypothesis. An initial spot-check of the first and last few bytes
  suggested two clean, uniform 65536-byte channel planes (matching a
  grayscale+alpha canvas) — but a full byte-histogram/transition analysis of the same
  tile showed a **repeating 256-byte period with an internal 245/11 split**, which is
  incompatible with "N uniform planes" for a perfectly uniform-color fill. This pattern
  wasn't decoded before the investigation was called off.

**Decision at this point in the session**: do not ship a guessed pixel decoding — see
the follow-up below for what changed this. A wrong guess here would produce
silently-corrupted colors in an imported page — strictly worse than the lower-but-
correct resolution the embedded-preview path already provides reliably.

### Follow-up: `Offscreen.Attribute` structure, via `clip_to_psd`'s source

A later research pass read [dobrokot/clip_to_psd](https://github.com/dobrokot/clip_to_psd)'s
actual `clip_to_psd.py` (MIT, ~3000 lines, a working, feature-complete CLI converter —
used here purely as reference documentation of the byte layout, same as `clipdecode`,
not copied) rather than just noting its existence. This resolved several structural
questions but, notably, still not the core one:

- `Offscreen.Attribute`'s `"Parameter"` section (confirmed byte offsets: header(16) +
  tag(22) + `bitmap_width`(4) + `bitmap_height`(4)) is immediately followed by
  **`block_grid_width`(4) + `block_grid_height`(4) — the tile grid size is explicitly
  stored in the file**, not something to compute as `ceil(dimension/256)` (this
  happened to match in every file tested, but shouldn't be assumed in general) — then
  a 16-int `attributes_arrays` array whose elements `[1]` and `[2]` form a
  `packing_type` tuple that determines the tile's pixel layout.
- For `packing_type == (1, 4)`, `clip_to_psd.py`'s own `decode_to_img()` decodes a tile
  as: **one leading 65536-byte 8-bit alpha plane, followed by 4×65536 bytes of
  interleaved (B, G, R, unused) pixel data** — i.e. 5 bytes/pixel total (327680 bytes
  for a 256×256 tile), matching this session's very first measurement against the
  public 24×24px test fixtures exactly. That earlier "5 bytes/pixel, presumably BGRA +
  1 unknown byte" finding was correct; the unknown 5th byte is simply unused padding
  from the interleaved RGBA-shaped read, and the real leading alpha plane is a separate
  channel entirely, not something layered elsewhere in the pixel loop.
- **Neither of the user's real test files use this packing_type.** Both (a plain color
  test canvas and, separately, one deliberately built to isolate a single raster fill)
  report `packing_type == (1, 1)` — 2 total 8-bit channels, 131072 bytes/tile — a
  combination `clip_to_psd.py`'s own decoder does not handle either (its `decode_to_img`
  asserts `packing_type == (1, 4) or channel_count_sum == 1`, and `(1, 1)` sums to `2`,
  failing that assertion the same way it would in this project's code). A byte-level
  transition analysis of a real, entirely solid-colored `(1, 1)` tile (see above) had
  already ruled out the simplest reading of that shape (two uniform 65536-byte planes)
  — a periodic 245/11-byte split repeating every 256 bytes was found instead, which
  doesn't match a clean plane boundary at all.

**Net result at this point**: the CSP version/settings that produced both of the first
two real test files uses a tile packing (`(1, 1)`) that isn't covered by either
community reference source consulted (`clipdecode` or `clip_to_psd`) — this looks like
a genuine format evolution in a CSP release newer than either of those
reverse-engineering efforts, not a gap in this session's research effort. `(1, 4)`
(alpha + interleaved BGRX) was, at this point, fully *understood* on paper but not yet
*proven* against real pixel data with a known ground truth (a solid black fill can't
distinguish channel order or rule out an interleaving mistake, since every channel is
zero).

### Final verification: `(1, 4)` proven pixel-exact, `(1, 1)` remains unresolved

Two more real test files, created specifically to break the solid-black ambiguity:

1. **A full-page solid pure-red (`#FF0000`) fill.** Its tile reported `packing_type ==
   (1, 4)` (not `(1, 1)` — packing type varies per layer/file, not a fixed CSP-version
   constant as first assumed). Decoding it via the layout above and sampling the
   corner, center, and opposite-corner tiles all produced **exactly `RGBA(255, 0, 0,
   255)`** — proof the channel order (B, G, R interleaved + a separate leading alpha
   plane) is correct, not just plausible.
2. **A full-page smooth horizontal black-to-white gradient**, the harder test: any
   channel-order or tile-position mistake would show up as visible banding, color
   fringing, or seams between the 7×10 tile grid. The decoded, reassembled image is
   **pixel-smooth with no visible tile boundaries at all**, and sampled values increase
   monotonically left-to-right exactly as expected (RGBA center values at tile columns
   0/3/6: `(0,0,0,255)` → `(58,58,58,255)` → `(238,238,238,255)`).

Both `(1, 1)` test files were also re-checked with the now-understood
`attributes_arrays`-based parsing — still `(1, 1)`, still not decodable (same blocker as
above; not re-investigated further given `(1, 4)` is now shippable for whichever
files/layers use it).

**Final decision**: `clipImport.ts` ships full-resolution compositing (`quality:
"full"`) for any page where every visible layer is raster/paper (or the ignorable
`Storyinformation` overlay) **and** its tiles use the verified `(1, 4)` packing with
real persisted data — `canUseFullResolutionComposite()` checks this explicitly and
falls back to the `CanvasPreview` extraction (`quality: "preview"`) for anything else,
including the still-unsolved `(1, 1)` packing and any other packing this module doesn't
recognize. No guessing: every code path that produces `"full"` output has been
pixel-verified against known ground truth; everything else safely degrades to the
lower-but-always-correct preview.

## Result: PASS

- **`(1, 4)` full-resolution layer compositing**: PASS — pixel-exact against a solid
  color fill and a smooth gradient (no seams, no banding, correct channel order).
  Ships as `quality: "full"`.
- **`CanvasPreview` PNG extraction**: PASS (unchanged) — the automatic fallback for
  every page that doesn't qualify for full-resolution compositing, `quality:
  "preview"`.
- **`(1, 1)` packing**: NOT SHIPPED — genuinely unresolved even after reading
  `clip_to_psd.py`'s actual source; not covered by any reference implementation found.
  A future attempt should triangulate its byte semantics against a tile with
  deliberately varied, known content (a gradient or checkerboard — a solid fill, black
  or otherwise, is not enough on its own, as this session's own dead end with a solid
  fill demonstrated even after finding the right reference source).

`sql.js` (MIT, WASM, no native compilation) is the only new runtime dependency added
(`server/package.json`), used for the SQLite-metadata read every code path needs.
`CanvasPreview` extraction was separately live-tested against three real files (a
complex multi-layer page with folders/text/vector/hidden layers, a minimal
single-raster-layer file, and a public 24×24px test fixture) — a faithful visual match
against the CSP screenshot of the multi-layer test page.
