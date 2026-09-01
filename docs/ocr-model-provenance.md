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
  official ONNX export exists yet** for OCR. Using it in onnxruntime-web requires
  converting it ourselves from the GPL-3.0 checkpoint + zyddnys/manga-image-translator's
  own (also GPL-3.0) Python model-definition code. That conversion is a real, external
  blocker for this session specifically: it needs Python + PyTorch + the ~200MB
  checkpoint downloaded and run through a conversion script, none of which this
  Node/TS coding session can execute. It is not a "lots of code" problem, it's a
  "needs a different toolchain/environment" problem.

## Result: PARTIAL PASS

- **Detection (Auto-Bubbles boxes, no text)**: PASS — `comictextdetector.pt.onnx` from
  zyddnys/manga-image-translator's own GitHub Releases, GPL-3.0, already ONNX, usable
  immediately as the model-loader's detection source.
- **OCR (recognized text)**: BLOCKED on a one-time external conversion step (Python/
  PyTorch, outside this session's toolchain) — needs to happen before `modelLoader.ts`
  can point at a real OCR ONNX file. Options once that's picked up: (a) do the
  PyTorch→ONNX conversion in a Python environment and self-host the result (cleanest,
  matches the GPL-3.0 chain exactly), or (b) find a different, already-ONNX-exported
  OCR model with its own clear, explicit license (a fresh Step-0-style check would be
  needed for whichever one is chosen).

Do not substitute a different/unverified model source for the detector without
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
