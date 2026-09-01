# OCR/Auto-Bubbles model provenance

Recorded as Step 0 of the Auto-Bubbles/OCR plan — must stay accurate; update if the
model source ever changes.

## Source chain

1. [lightweight-manga-typeset](https://github.com/zuttodoS/lightweight-manga-typeset)
   (the project that inspired this feature) has **no LICENSE file** — its wrapper code
   is therefore not reused anywhere in ComiKumi, only its general technical approach
   (client-side ONNX inference via onnxruntime-web) served as inspiration. Its own
   README states: *"Models are converted from the
   [manga-image-translator](https://github.com/zyddnys/manga-image-translator) project
   and loaded lazily on first use."*
2. [zyddnys/manga-image-translator](https://github.com/zyddnys/manga-image-translator)
   is **GPL-3.0** licensed (`[GPL-3.0 license](#GPL-3.0-1-ov-file)` in its README).
3. Its model weights are hosted at
   [huggingface.co/zyddnys/manga-image-translator](https://huggingface.co/zyddnys/manga-image-translator),
   whose model card metadata **explicitly declares `License: gpl-3.0`** for the weights
   themselves (not just the surrounding code) — i.e. the weights carry their own
   explicit, redistribution-permitting license, not an implicit/undocumented one.

## Compatibility assessment

ComiKumi is AGPL-3.0-or-later. GPL-3.0 and AGPL-3.0 are FSF-recognized compatible
licenses — a work combining GPL-3.0 and AGPL-3.0 components is distributed under
AGPL-3.0 (the stronger copyleft). This covers both delivery paths the Auto-Bubbles
plan uses:

- **Client-side fetch from HuggingFace** (primary path): the browser downloads the
  GPL-3.0-licensed weights directly from their own HuggingFace repo at runtime —
  ComiKumi never bundles or redistributes them itself here.
- **Self-hosted server-side mirror** (`OCR_MODELS_DIR` fallback route, for offline/
  air-gapped operators): this DOES redistribute the weights from ComiKumi's own
  server. Permitted under GPL-3.0 as long as the license notice/attribution
  travels with them — **the `docs/deploy-runbook.md` section for this fallback, and
  a `README`/`NOTICE` file dropped alongside the models in `DATA_DIR/models/`, must
  credit zyddnys/manga-image-translator and reference GPL-3.0** (do not strip
  attribution when documenting the manual-population step).

## Correction — the actual URLs lightweight-manga-typeset fetches are NOT usable as-is

Tracing `ml.js`'s real, hardcoded `fetchModel()` source (not just the README's prose
credit) shows it downloads from:

```
https://huggingface.co/noobv2ram/lightweight-manga-typeset/resolve/main/<file>.onnx
```

**This is a third-party reupload with no model card, no license tag, and no stated
provenance at all** (`huggingface.co/noobv2ram/lightweight-manga-typeset` — verified,
"No model card"). It is a different repo from `zyddnys/manga-image-translator` (which
does carry the explicit GPL-3.0 tag from section "Compatibility assessment" above, but
whose own root HF repo only actually hosts `ocr_ar_48px.ckpt` — an *Arabic* OCR
checkpoint — not the `manga_det.onnx`/`manga_ocr_*.onnx` files at all). **Do not point
ComiKumi at the `noobv2ram` mirror** — an unlicensed third party's re-conversion is not
a redistribution-permitting source, regardless of what the original upstream project's
license is.

## Clean first-party source found instead

- **Detection model**: `zyddnys/manga-image-translator`'s own GitHub Releases
  (`github.com/zyddnys/manga-image-translator/releases/tag/beta-0.2.1`, the GPL-3.0
  repo itself — first-party, not a mirror) includes **`comictextdetector.pt.onnx`
  already ONNX-exported**, alongside `comictextdetector.pt` (PyTorch), `detect.ckpt`,
  `ocr.ckpt`, `inpainting.ckpt`. The detector architecture/training itself traces to
  [dmMaze/comic-text-detector](https://github.com/dmMaze/comic-text-detector) (also
  GPL-3.0), which explicitly points at this same zyddnys release as the canonical
  download for its trained weights. **This one is clean: first-party, explicit
  GPL-3.0, already ONNX.**
- **OCR model**: the same release only has `ocr.ckpt` (a PyTorch checkpoint) — **no
  official ONNX export exists**. Using it in onnxruntime-web would have required
  converting it ourselves from the GPL-3.0 checkpoint + zyddnys/manga-image-translator's
  own (also GPL-3.0) Python model-definition code — a real, external blocker (Python +
  PyTorch + a ~200MB checkpoint run through a conversion script, none of which this
  Node/TS coding session can execute). **Superseded** — see the next section for the
  model actually adopted instead, which needed no conversion step at all.

## OCR model chosen instead: `onnx-community/manga-ocr-base-ONNX`

Found and verified in a later session (2026-09-01), replacing the blocked
zyddnys/manga-image-translator OCR path above — a complete, unbroken Apache-2.0 chain,
already ONNX-exported, no external conversion toolchain needed:

1. [kha-white/manga-ocr](https://github.com/kha-white/manga-ocr) — the original OCR
   project/training code. **Apache-2.0** (`license:apache-2.0` tag on its own repo).
2. [kha-white/manga-ocr-base](https://huggingface.co/kha-white/manga-ocr-base) — the
   trained PyTorch weights this project publishes, hosted on HuggingFace. **Apache-2.0**
   (confirmed via the HuggingFace API's own `cardData.license` field, not just README
   prose — same standard this doc already holds the detector to). Also hosts the
   tokenizer (`vocab.txt`, `tokenizer_config.json`, `special_tokens_map.json`) —
   `BertJapaneseTokenizer`-shaped, WordPiece.
3. [onnx-community/manga-ocr-base-ONNX](https://huggingface.co/onnx-community/manga-ocr-base-ONNX)
   — an ONNX conversion of #2, published by HuggingFace's own `onnx-community`
   organization (via their public auto-conversion Space, not an anonymous third-party
   reupload). **Apache-2.0** (confirmed via the HuggingFace API, same as #2). File
   layout is the standard `transformers.js`/Vision-Encoder-Decoder shape:
   `onnx/encoder_model.onnx` + `onnx/decoder_model.onnx` (plus several quantized
   variants), `config.json`, `generation_config.json`, `preprocessor_config.json`.

**Superseded by live testing (2026-09-01)** — see the next section. `onnx-community/manga-ocr-base-ONNX`
turned out architecturally incompatible with `@huggingface/transformers`'s Vision2Seq
pipeline (missing file, not a tokenizer/config gap): confirmed via a real
`Could not locate file: ".../onnx/decoder_model_merged_quantized.onnx"` error.
transformers.js v4.2.0's `MODEL_SESSION_CONFIG` hard-codes a single-graph "merged"
decoder filename for this model type (`decoder_model_merged` — a KV-cache-branching
graph via a `use_cache_branch` input) with no supported option to fall back to the
separate `decoder_model.onnx` this repo actually has. Not a guess — read directly out
of the installed package's own source
(`node_modules/@huggingface/transformers/dist/transformers.js`).

## OCR model actually used: `xingliao/manga-ocr-onnx-full`

Search for an already-merged, transformers.js-compatible conversion of the same
underlying model (2026-09-01), since #3 above can't be used as-is:

- **Verified same model**: `config.json` shows a ViT encoder
  (`facebook/deit-base-patch16-224`, Apache-2.0) + a Japanese-char BERT decoder
  (`cl-tohoku/bert-base-japanese-char-v2`), vocab size 6144 — matches
  `kha-white/manga-ocr-base`'s documented architecture exactly, confirming this is the
  same model, just packaged with the decoder file transformers.js needs
  (`onnx/decoder_model_merged.onnx`) plus a full tokenizer set
  (`tokenizer.json`/`tokenizer_config.json`/`special_tokens_map.json`/`vocab.txt`) —
  incidentally also closing the tokenizer-file gap #3 had.
- **License**: explicit `apache-2.0` tag (HuggingFace API `cardData.license` and
  `license:apache-2.0` tag, same standard this doc holds every source to) — no README
  prose beyond the license frontmatter, but the tag itself is authoritative the same
  way it was for #2/#3 above.
- **Rejected alternatives found along the way** (same search, explicitly NOT used):
  `ms57rd/manga-ocr-base-ONNX` has the exact right files (merged decoder + full
  tokenizer) but its HuggingFace page states **"No model card"** — no license tag, no
  attribution, nothing — the identical red flag that got `noobv2ram/lightweight-manga-typeset`
  rejected earlier in this document. `snekky123/manga-ocr-base-onnx`,
  `mayocream/manga-ocr-onnx`, and `ogkalu/manga-ocr-onnx` are all cleanly
  Apache-2.0-tagged but, like `onnx-community`'s own conversion, lack the merged
  decoder file — same incompatibility, just cleaner licensing than `ms57rd`.
- **dtype**: this repo only ships unquantized (`fp32`) encoder/decoder files, no
  `_quantized`/`_fp16`/etc. variants — `worker.ts`'s `pipeline()` call sets
  `dtype: "fp32"` explicitly, since transformers.js's own default for the `"wasm"`
  device is `"q8"` (a `_quantized` filename suffix), which is exactly the missing-file
  error above.

**Superseded by live testing (2026-09-01, second round)** — `xingliao/manga-ocr-onnx-full`
loaded and ran without error, but produced degenerate output: repeated `[CLS]` tokens
interspersed with sparse/near-random kanji, for every one of 4 correctly-detected
regions, running long instead of stopping cleanly at `eos_token_id`. Ruled out before
looking elsewhere: `config.json`'s special-token IDs (`decoder_start_token_id: 2`,
`eos_token_id: 3`, `pad_token_id: 0`, `vocab_size: 6144`) confirmed byte-identical to
`kha-white/manga-ocr-base`'s — not a config mismatch — and ComiKumi's own
`cropToCanvas()`/`RawImage.fromCanvas()` image-feed path is a standard RGBA extraction
with nothing unusual in it. That leaves the model file itself: `xingliao`'s repo is a
minimal, single-variant (fp32-only), provenance-thin upload — no README beyond the
license tag, no evidence of how the "merge" into a single KV-cache-branching decoder
graph was produced — consistent with a broken or incorrectly-wired merge (e.g. the
encoder→decoder cross-attention link not actually carrying image features through,
which would explain generation proceeding as if blind to the image).

## OCR model actually used: `DigitalLarynx/manga-ocr-onnx`

Found searching further (2026-09-01) for another already-merged conversion, since
`xingliao/manga-ocr-onnx-full` above loads but is functionally broken:

- **Verified same model**: `config.json` — `decoder_start_token_id: 2`,
  `eos_token_id: 3`, `pad_token_id: 0`, `vocab_size: 6144`, encoder
  `facebook/deit-base-patch16-224`, decoder `cl-tohoku/bert-base-japanese-char-v2` — all
  identical to `kha-white/manga-ocr-base`.
- **License**: explicit `apache-2.0` tag (HuggingFace API), same standard as every
  other source in this document.
- **Stronger provenance signal than `xingliao`**: this repo has the *complete* standard
  `optimum-cli export onnx` + transformers.js quantization suite — unsuffixed
  (fp32) `encoder_model.onnx`/`decoder_model.onnx` **and** `decoder_model_merged.onnx`,
  plus every quantized variant (`_fp16`, `_int8`, `_uint8`, `_q4`, `_q4f16`, `_bnb4`,
  `_quantized`) for both encoder and decoder, plus the full tokenizer file set
  (`tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, `vocab.txt`).
  A full, internally-consistent automated export set is much better evidence of a
  correct, non-hand-patched conversion than `xingliao`'s single fp32-only file was —
  though this is circumstantial, not a guarantee; if this model also turns out
  degenerate in live testing, the next step is either self-converting from
  `kha-white/manga-ocr-base` with `optimum-cli` directly, or adding token-ID-level
  diagnostic logging to see exactly where generation goes wrong.
- **dtype**: no longer relevant — see "Hand-rolled inference" below; the encoder/
  decoder pair is driven directly via onnxruntime-web (`float32` tensors throughout),
  not through transformers.js's `pipeline()`/dtype option.

## First (wrong) diagnosis — thought to be a Japanese-vs-German language mismatch

Added a diagnostic to the review panel — `DetectedRegion.previewDataUrl`
(`worker.ts`'s `canvasToDataUrl()`, rendered as an `<img>` in
`AutoBubblesReviewPanel.tsx`, kept as a permanent feature since it's useful beyond
debugging) — showing the *exact* pixels handed to OCR next to each suggestion. The
crops were correct: sharp, well-positioned, exactly the right bubble. The text inside
them was **German** ("MISSION: LETZTES STÜCK", "Oh nein–!", etc.), and `manga-ocr` is
a Japanese-only model (Japanese-character-level decoder vocab, no Latin
representation) — so the working theory became "correct models, wrong test-page
language." **This was wrong**: retested with a genuinely Japanese test page
(confirmed via the same crop-preview thumbnails — real, legible Japanese text) and
`DigitalLarynx/manga-ocr-onnx`'s `decoder_model_merged.onnx` still produced the exact
same degenerate garbage. The crop pipeline and language were both red herrings.

## Root cause, confirmed via live token-ID diagnostics — the merged decoder graph never receives the encoder's image features

Bypassed `pipeline()`'s convenience wrapper to call `model.generate()` directly and
inspect raw generated token IDs (not just decoded text), run against
`DigitalLarynx/manga-ocr-onnx`'s `decoder_model_merged.onnx`:

1. **Real crop vs. a blank gray image of the same size**: the first non-special
   generated token was identical either way (token `933`, "ん") — the decoder producing
   the same output for two completely different images is only possible if it isn't
   actually conditioning on the image.
2. **Beam search (the model's own `generation_config.json` default, `num_beams: 4`)
   vs. forced greedy decoding (`num_beams: 1, do_sample: false`)**: byte-identical
   token IDs — rules out beam search specifically as the cause.
3. **Cached KV-reuse generation vs. `use_cache: false`** (forcing every step to be a
   full, non-cached forward pass): still byte-identical token IDs to both of the above
   — rules out cache reuse specifically as the cause.

All four variants (real/blank × beam/greedy, and cached/uncached) produced the exact
same deterministic, meaningless sequence — token `2` (`[CLS]`, the
`decoder_start_token_id`) repeating in a fixed pattern interspersed with a handful of
seemingly-arbitrary kanji. This only makes sense if the encoder's image features never
reach the decoder's cross-attention at all — a broken/disconnected encoder→decoder
link in the "merged" ONNX conversion itself, independent of decoding strategy or
caching. Both `xingliao/manga-ocr-onnx-full` and `DigitalLarynx/manga-ocr-onnx`'s
merged decoders fail identically despite being independent uploads — most plausibly a
bug shared by whatever common `optimum-cli`-style export/merge process both went
through for this specific architecture (Vision-Encoder-Decoder + merged/KV-branching
decoder), not something wrong with either uploader's weights specifically.

**Confirmed with the user (2026-09-01)**: this is a real, reproducible defect in the
"merged decoder" approach for this model family, not fixable by trying yet another
merged conversion. Decision: switch to hand-rolled inference (below), which the
original plan's "transformers.js instead of a hand-rolled loop" decision had
explicitly avoided — reversed here only because the merged/library-driven path is
confirmed non-functional for this specific architecture, not as a general preference.

## Hand-rolled inference — unmerged `encoder_model.onnx` + `decoder_model.onnx`

`worker.ts` now fetches `DigitalLarynx/manga-ocr-onnx`'s UNMERGED
`onnx/encoder_model.onnx` + `onnx/decoder_model.onnx` pair (same repo, same license/
architecture verification as above — only the specific file pair changed) via
`modelLoader.ts`'s `ensureOcrOnnxLoaded()` (same persistent Cache-API pattern as the
detector), and drives them directly through onnxruntime-web with a hand-written
greedy generation loop (`worker.ts`'s `generateText()`): one encoder forward pass per
region, then a token-by-token decoder loop (no KV-cache reuse — the unmerged decoder
has no "with past" variant, so each step recomputes self-attention over the whole
sequence generated so far; capped at 64 new tokens, comfortably over a real caption's
length while keeping the O(n²) recompute cost bounded) until `eos_token_id` (`3`) or
the cap is hit. Tokenization still goes through `@huggingface/transformers`'s
`AutoTokenizer.from_pretrained()` — only `pipeline()`/`AutoModelForVision2Seq`'s
session-file selection (the part that hardcodes the merged decoder) is bypassed, not
the whole library.

**Live-tested (2026-09-01) against a real Japanese test page — works.** Four detected
regions, recognized text visibly conditioned on the actual image content for the
first time (previous rounds were provably blind to the image, see above):
`ミッション・最後のひと切れ` (actual: `ミッション：最後のひと切れ` — colon read as a
middle dot), `最後のいちこショート、ゲット！` (actual: `最後の いちごショート、ゲット!`
— one dakuten dropped, いちご→いちこ), `きゃっ!` (exact match), and an SFX-only region
(scattered debris lines, no real text) recognized as empty/near-empty as expected. The
remaining small per-character misreads are ordinary OCR imprecision, not a pipeline
bug — the encoder→decoder connection that was completely broken through the merged
graph is now demonstrably working.

## Result: FULL PASS — license, architecture, and hand-rolled generation loop all live-verified

- **Detection (Auto-Bubbles boxes)**: PASS — `comictextdetector.pt.onnx` from
  zyddnys/manga-image-translator's own GitHub Releases, GPL-3.0, already ONNX. Live-
  tested, correct box counts confirmed by the user across three test pages.
- **OCR (recognized text)**: PASS — `DigitalLarynx/manga-ocr-onnx`, Apache-2.0, same
  `kha-white/manga-ocr-base` architecture, driven via hand-rolled onnxruntime-web
  inference over its unmerged `encoder_model.onnx`/`decoder_model.onnx` pair (the
  merged decoder is confirmed broken, see above — do not switch back to it or to
  `pipeline()`/`AutoModelForVision2Seq` for this model without re-verifying the
  cross-attention connection first). Live-tested against a real Japanese page with
  plausible, image-conditioned recognized text. Still Japanese-only by design (see
  `docs/FEATURES.md`'s Auto-Bubbles section).

Do not substitute a different/unverified model source for either model without
repeating this check.

## Runtime contract (confirmed via live inference, 2026-09-01)

The license/provenance check above was done before this model was ever actually run
through onnxruntime-web — three real bugs surfaced only once real inference was tried
against real pages, all now fixed in `client/src/ocr/{worker,preprocess,detection}.ts`.
Recorded here since a future model substitution needs to re-verify all three, not just
the license:

- **Input size**: fixed **1024×1024** (`DETECTOR_INPUT_SIZE` in `worker.ts`), NOT 2048
  as originally assumed — onnxruntime-web's own `OrtRun` error ("Expected: 1024") is
  what caught this.
- **Normalization**: plain `px/255` (0..1 range), confirmed against the upstream
  `zyddnys/manga-image-translator` reference preprocessing — NOT `(px/127.5)-1`
  (-1..1 range) this file originally used.
- **Outputs**: the ONNX graph exposes **three** named outputs — `blk` (box-regression,
  unused here), `seg` (the text-region mask this detector actually needs, shape
  `[1,1,1024,1024]`), `det` (a second map, unused here, likely the upstream
  "lines_map"). `worker.ts` selects `seg` by shape (`dims[1] === 1`) rather than
  assuming output index 0.
- **`seg` activation**: already a **0..1 probability map** — the graph applies sigmoid
  internally (confirmed live: raw values span [~0, 1.0] with an exact max of 1.0).
  `decodeDetections()`'s own sigmoid step must be skipped for this model
  (`alreadyActivated: true`) — applying it twice compresses every pixel into
  [0.5, 0.73], always above `TEXT_THRESH` regardless of image content, which
  silently produced zero detections on every page (not a crash) until diagnosed via
  live console instrumentation.

Still **unverified** (not yet hit in testing, so not yet root-caused): channel order
(RGB vs BGR) — the upstream preprocessing does a `BGR2RGB` conversion immediately
followed by a channel-axis reversal, whose net effect on final channel order wasn't
fully traceable from the parts of the source read so far. If detected boxes are
present but visibly biased/wrong (as opposed to zero, which the three bugs above
already explain), this is the next thing to check.
