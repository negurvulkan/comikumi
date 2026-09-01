/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers";
import { v4 as uuid } from "uuid";
import { decodeDetections, type Box } from "./detection";
import { resizeAndPadToTensor, preprocessForOcr, cropToCanvas } from "./preprocess";
import type { RunRequest, WorkerMessage, DetectedRegion } from "./types";

// Static-copied by vite-plugin-static-copy (see vite.config.ts) — served as plain
// files, not run through Vite's normal JS/asset pipeline, since onnxruntime-web
// resolves these itself at runtime by URL, not via a bundler import.
ort.env.wasm.wasmPaths = "/ort/";
// Deliberately single-threaded (no SharedArrayBuffer/crossOriginIsolated requirement)
// — see docs/ocr-model-provenance.md's sibling plan note: COOP/COEP for threaded WASM
// is a deferred v2 optimization, not a v1 requirement. The same wasm binary runs fine
// single-threaded, just slower than the multi-threaded path would be.
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

// The model's actual fixed input shape (confirmed via onnxruntime-web's own
// "Got invalid dimensions... Expected: 1024" error at runtime) — 2048 was an
// unverified assumption baked in before this was ever actually run against real
// inference (only the model's license/provenance had been checked, not its shape).
const DETECTOR_INPUT_SIZE = 1024;

// Apache-2.0 chain: kha-white/manga-ocr -> kha-white/manga-ocr-base -> this ONNX
// conversion — see docs/ocr-model-provenance.md for the full license verification and
// the "hand-rolled inference" section explaining why this is driven directly via
// onnxruntime-web (below) instead of transformers.js's own `pipeline()`: every
// "merged" (KV-cache-branching) decoder conversion tried — including this same
// repo's own `decoder_model_merged.onnx` — loaded and ran without error but produced
// degenerate output, confirmed via live diagnostics as the encoder's image features
// never actually reaching the decoder (identical output for a real crop vs. a blank
// image, identical regardless of beam search vs. greedy decoding, identical with or
// without KV-cache reuse) — a conversion-specific bug in the merged graph, not this
// model, not transformers.js's tokenizer, and not this app's own crop/preprocessing
// (independently confirmed correct via the review panel's crop-preview thumbnails).
// This file instead fetches the UNMERGED `encoder_model.onnx` + `decoder_model.onnx`
// pair (see modelLoader.ts's `ensureOcrOnnxLoaded()`) and drives a plain greedy
// generation loop by hand — the same onnxruntime-web API already used for the
// detector above, just without any KV-cache reuse (recomputes decoder self-attention
// over the whole sequence-so-far every step, since there's no "with past" file to
// reuse) — perfectly fine for a single short manga caption line.
const OCR_MODEL_ID = "DigitalLarynx/manga-ocr-onnx";

// From this model's (and kha-white/manga-ocr-base's, byte-identical) config.json /
// generation_config.json — see docs/ocr-model-provenance.md.
const OCR_DECODER_START_TOKEN_ID = 2;
const OCR_EOS_TOKEN_ID = 3;
// Generous for a single manga caption/speech-bubble line (kha-white/manga-ocr-base's
// own generation_config.json allows up to 300, but that's sized for beam search with
// KV-cache reuse; without a cache, decoder self-attention is recomputed over the
// whole sequence every step, so this is also a deliberate O(n²) cost cap).
const OCR_MAX_NEW_TOKENS = 64;

function post(message: WorkerMessage): void {
  self.postMessage(message);
}

/** Tries WebGPU first (no special headers needed, fastest), falls back to
 * single-thread WASM — an explicit try/create/catch/retry rather than relying on
 * onnxruntime-web's own executionProviders-array fallback behavior, which is not
 * consistently reliable for "provider unavailable" across browsers/versions. Shared
 * by the detector and both OCR (encoder/decoder) sessions — same runtime, same
 * fallback reasoning, only the model bytes differ. */
async function createOrtSession(modelBuffer: ArrayBuffer): Promise<ort.InferenceSession> {
  try {
    return await ort.InferenceSession.create(modelBuffer, { executionProviders: ["webgpu"] });
  } catch {
    return ort.InferenceSession.create(modelBuffer, { executionProviders: ["wasm"] });
  }
}

async function runDetection(session: ort.InferenceSession, imageBitmap: ImageBitmap): Promise<Box[]> {
  const { tensorData, info } = resizeAndPadToTensor(imageBitmap, DETECTOR_INPUT_SIZE);
  const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, DETECTOR_INPUT_SIZE, DETECTOR_INPUT_SIZE]);
  const inputName = session.inputNames[0];
  const outputs = await session.run({ [inputName]: inputTensor });
  // The upstream reference model (zyddnys/manga-image-translator's comictextdetector)
  // has THREE outputs — an (unused here) box-regression head, the single-channel text
  // "mask" this detector actually needs, and a separate "lines_map" used only by its
  // own polygon-extraction post-processing — not one single tensor at output index 0.
  // Picking by shape (batch=1, channels=1, i.e. a per-pixel probability map) rather
  // than blindly taking session.outputNames[0] avoids silently decoding the wrong
  // output if the ONNX export orders them differently than expected.
  const outputTensor =
    session.outputNames.map((name) => outputs[name]).find((t) => t.dims.length === 4 && t.dims[0] === 1 && t.dims[1] === 1) ??
    outputs[session.outputNames[0]];
  // Output map dimensions come from the tensor itself rather than being assumed —
  // some detector export variants emit the probability map at a different resolution
  // than the input (e.g. downsampled by the model's own stride).
  const [, , mapHeight, mapWidth] = outputTensor.dims as [number, number, number, number];
  // alreadyActivated: true — confirmed via live inference that this model's `seg`
  // output is already a 0..1 probability map (its own graph applies sigmoid
  // internally), not raw logits — see decodeDetections' doc comment for the full
  // "double sigmoid" story this fixes.
  return decodeDetections(outputTensor.data as Float32Array, mapWidth, mapHeight, info, true);
}

/** PNG data URL for a crop, so the review panel can show exactly what OCR saw —
 * `FileReader` (available in a DedicatedWorkerGlobalScope, not just the main thread)
 * rather than `URL.createObjectURL`, since a data URL survives postMessage as a plain
 * string with no lifetime/revocation to manage on the receiving (main-thread) side. */
function canvasToDataUrl(canvas: OffscreenCanvas): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.convertToBlob({ type: "image/png" }).then((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("Crop-Vorschau konnte nicht gelesen werden"));
      reader.readAsDataURL(blob);
    }, reject);
  });
}

/** One region's text, via a plain greedy autoregressive loop over the unmerged
 * encoder/decoder pair — no KV-cache reuse (see module doc comment for why), so each
 * step re-runs the decoder over the full sequence generated so far. Feeds are built
 * from `decoderSession.inputNames` rather than a fixed list, since the exact input
 * set an `optimum-cli`-style export exposes (`encoder_attention_mask`/
 * `attention_mask` presence varies) isn't something to hardcode without having run
 * the actual file — an unrecognized required input throws a clear, specific error
 * instead of silently sending a wrong/empty feed. */
async function generateText(
  encoderSession: ort.InferenceSession,
  decoderSession: ort.InferenceSession,
  tokenizer: PreTrainedTokenizer,
  crop: OffscreenCanvas
): Promise<string> {
  const pixelValues = preprocessForOcr(crop);
  const pixelTensor = new ort.Tensor("float32", pixelValues, [1, 3, 224, 224]);
  const encoderOutputs = await encoderSession.run({ [encoderSession.inputNames[0]]: pixelTensor });
  const encoderHiddenStates = encoderOutputs[encoderSession.outputNames[0]];
  const encoderSeqLen = encoderHiddenStates.dims[1] as number;

  const ids: bigint[] = [BigInt(OCR_DECODER_START_TOKEN_ID)];
  for (let step = 0; step < OCR_MAX_NEW_TOKENS; step++) {
    const inputIdsTensor = new ort.Tensor("int64", BigInt64Array.from(ids), [1, ids.length]);
    const feeds: Record<string, ort.Tensor> = {};
    for (const name of decoderSession.inputNames) {
      if (name === "input_ids") feeds[name] = inputIdsTensor;
      else if (name === "encoder_hidden_states") feeds[name] = encoderHiddenStates;
      else if (name === "encoder_attention_mask") {
        feeds[name] = new ort.Tensor("int64", new BigInt64Array(encoderSeqLen).fill(1n), [1, encoderSeqLen]);
      } else if (name === "attention_mask") {
        feeds[name] = new ort.Tensor("int64", new BigInt64Array(ids.length).fill(1n), [1, ids.length]);
      } else {
        throw new Error(`OCR-Decoder erwartet unbekannten Eingabe-Namen "${name}" — Modellformat weicht vom erwarteten ab.`);
      }
    }
    const decoderOutputs = await decoderSession.run(feeds);
    const logitsTensor = decoderOutputs["logits"] ?? decoderOutputs[decoderSession.outputNames[0]];
    const [, seqLen, vocabSize] = logitsTensor.dims as [number, number, number];
    const logits = logitsTensor.data as Float32Array;
    const lastStepOffset = (seqLen - 1) * vocabSize;
    let bestId = 0;
    let bestValue = -Infinity;
    for (let v = 0; v < vocabSize; v++) {
      const value = logits[lastStepOffset + v];
      if (value > bestValue) {
        bestValue = value;
        bestId = v;
      }
    }
    ids.push(BigInt(bestId));
    if (bestId === OCR_EOS_TOKEN_ID) break;
  }

  const generatedIds = ids.slice(1).map(Number); // drop the leading decoder-start token
  return tokenizer.decode(generatedIds, { skip_special_tokens: true }).trim();
}

/** Crops each detected region out of the page and reads its text — one OCR call per
 * region (the model reads one text block at a time, same as a human would), reporting
 * "recognizing" progress per region. A region that fails to crop (degenerate box, see
 * cropToCanvas) or whose OCR call throws keeps an empty `recognizedText` rather than
 * aborting the whole batch — one bad region shouldn't lose every other region's
 * result, same "don't block on OCR" principle the pre-OCR stub was built around. */
async function runRecognition(
  imageBitmap: ImageBitmap,
  boxes: Box[],
  ocrEncoderModel: ArrayBuffer,
  ocrDecoderModel: ArrayBuffer
): Promise<DetectedRegion[]> {
  const regions: DetectedRegion[] = boxes.map((box) => ({
    id: uuid(),
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    confidence: box.confidence,
    recognizedText: "",
  }));
  if (boxes.length === 0) return regions;

  const [encoderSession, decoderSession, tokenizer] = await Promise.all([
    createOrtSession(ocrEncoderModel),
    createOrtSession(ocrDecoderModel),
    AutoTokenizer.from_pretrained(OCR_MODEL_ID),
  ]);

  for (let i = 0; i < boxes.length; i++) {
    post({ type: "progress", stage: "recognizing", current: i, total: boxes.length });
    const canvas = cropToCanvas(imageBitmap, boxes[i]);
    if (!canvas) continue;
    try {
      regions[i].previewDataUrl = await canvasToDataUrl(canvas);
      regions[i].recognizedText = await generateText(encoderSession, decoderSession, tokenizer, canvas);
    } catch {
      // Leave this one region's recognizedText empty (see doc comment) — the user
      // still gets every other region's result and can type this one in by hand.
    }
  }
  post({ type: "progress", stage: "recognizing", current: boxes.length, total: boxes.length });
  return regions;
}

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  const { imageBitmap, detectorModel, ocrEncoderModel, ocrDecoderModel } = event.data;
  try {
    post({ type: "progress", stage: "loading-runtime", current: 0, total: 1 });
    const session = await createOrtSession(detectorModel);

    post({ type: "progress", stage: "detecting", current: 0, total: 1 });
    const boxes = await runDetection(session, imageBitmap);
    post({ type: "progress", stage: "detecting", current: 1, total: 1 });

    const regions = await runRecognition(imageBitmap, boxes, ocrEncoderModel, ocrDecoderModel);

    post({ type: "done", regions });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
