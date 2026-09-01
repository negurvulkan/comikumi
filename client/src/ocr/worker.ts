/// <reference lib="webworker" />
import * as ort from "onnxruntime-web";
import { v4 as uuid } from "uuid";
import { decodeDetections } from "./detection";
import { resizeAndPadToTensor } from "./preprocess";
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

function post(message: WorkerMessage): void {
  self.postMessage(message);
}

/** Tries WebGPU first (no special headers needed, fastest), falls back to
 * single-thread WASM — an explicit try/create/catch/retry rather than relying on
 * onnxruntime-web's own executionProviders-array fallback behavior, which is not
 * consistently reliable for "provider unavailable" across browsers/versions. */
async function createDetectorSession(modelBuffer: ArrayBuffer): Promise<ort.InferenceSession> {
  try {
    return await ort.InferenceSession.create(modelBuffer, { executionProviders: ["webgpu"] });
  } catch {
    return ort.InferenceSession.create(modelBuffer, { executionProviders: ["wasm"] });
  }
}

async function runDetection(session: ort.InferenceSession, imageBitmap: ImageBitmap): Promise<DetectedRegion[]> {
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
  const boxes = decodeDetections(outputTensor.data as Float32Array, mapWidth, mapHeight, info, true);

  return boxes.map(
    (box): DetectedRegion => ({
      id: uuid(),
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      confidence: box.confidence,
      // OCR is not wired in yet (see docs/ocr-model-provenance.md — no verified ONNX
      // source for it today) — the review panel's text field starts empty and the
      // user types the source text manually, same as any other new bubble, rather
      // than blocking Auto-Bubbles' box detection on OCR being unblocked.
      recognizedText: "",
    })
  );
}

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  const { imageBitmap, detectorModel } = event.data;
  try {
    post({ type: "progress", stage: "loading-runtime", current: 0, total: 1 });
    const session = await createDetectorSession(detectorModel);

    post({ type: "progress", stage: "detecting", current: 0, total: 1 });
    const regions = await runDetection(session, imageBitmap);
    post({ type: "progress", stage: "detecting", current: 1, total: 1 });

    post({ type: "done", regions });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
