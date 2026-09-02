/**
 * Persistent, Cache-API-backed loader for the Auto-Bubbles DETECTION and
 * text-RECOGNITION (OCR) models — same "memoized promise, de-dupe concurrent callers"
 * shape as editor/fontLoader.ts's ensureFontsLoaded(), but backed by the browser's
 * Cache API instead of an in-memory Map: these files are hundreds of MB, so surviving
 * a page reload (not re-fetching every time) is a hard requirement, not an
 * optimization. A failure here REJECTS rather than being swallowed to a warning —
 * neither step can run without its model, so the caller (useAutoBubblesRun.ts) needs a
 * real error to surface to the user.
 *
 * The OCR model is fetched here as plain ONNX files (`encoder_model.onnx` +
 * `decoder_model.onnx`, the UNMERGED pair) and driven directly via onnxruntime-web in
 * worker.ts, not through transformers.js's own `pipeline()`/`AutoModelForVision2Seq`
 * loading — see docs/ocr-model-provenance.md's "hand-rolled inference" section for why:
 * every "merged" (KV-cache-branching) decoder conversion found produced degenerate
 * output — confirmed via live diagnostics as encoder image features never actually
 * reaching the decoder — a problem specific to the merged-graph conversion, not this
 * model or transformers.js's tokenizer/processor loading (both of which are still used
 * from transformers.js, just not its Vision2Seq session-loading path).
 *
 * See docs/ocr-model-provenance.md for why these specific model URLs were chosen (and
 * why they must NOT be substituted without repeating that license check).
 */

import { authFetch } from "../api/authFetch";
import { apiUrl } from "../api/apiBase";

const CACHE_NAME = "comikumi-ocr-models-v1";

/** First-party, GPL-3.0, already-ONNX-exported — see docs/ocr-model-provenance.md's
 * "Clean first-party source found instead" section. Safe to fetch/cache today. */
const DETECTOR_URL = "https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.2.1/comictextdetector.pt.onnx";

/** Optional self-hosted mirror — if the server has files under `DATA_DIR/models/`
 * (see server/src/routes/ocrModels.ts), prefer those over the external URL so
 * offline/air-gapped operators never hit the network. Resolved lazily (not at module
 * load) since it needs one HEAD request to check availability. `ocrModelsRouter` is
 * behind the same `requireAuth` gate as every other API route, hence `authFetch`
 * (a plain unauthenticated `fetch()` would just 401). */
function localMirrorUrl(fileName: string): string {
  return apiUrl(`/api/ocr-models/${encodeURIComponent(fileName)}`);
}

async function resolveSourceUrl(fileName: string, externalUrl: string): Promise<{ url: string; isLocal: boolean }> {
  try {
    const res = await authFetch(localMirrorUrl(fileName), { method: "HEAD" });
    if (res.ok) return { url: localMirrorUrl(fileName), isLocal: true };
  } catch {
    // No local mirror reachable — fall through to the external URL.
  }
  return { url: externalUrl, isLocal: false };
}

async function fetchWithCache(
  cache: Cache,
  url: string,
  isLocal: boolean,
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void
): Promise<ArrayBuffer> {
  const cached = await cache.match(url);
  if (cached) return cached.arrayBuffer();

  // Only our own /api/ocr-models/... route gets the Bearer token — never the external
  // CDN. authFetch() attaches Authorization unconditionally, so using it for the
  // external URL would leak this session's token to a third-party host.
  const res = isLocal ? await authFetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`Modell konnte nicht geladen werden (${res.status}): ${url}`);

  // Stream + report progress when possible (large files, worth showing a percentage)
  // rather than awaiting the whole response at once; fall back to a plain buffer read
  // if the response body isn't a readable stream for some reason. Content-Length isn't
  // guaranteed (a compressing proxy can drop it) — callers treat a null total as
  // "unknown size", not zero.
  if (res.body && onProgress) {
    const totalHeader = res.headers.get("content-length");
    const total = totalHeader ? Number(totalHeader) : null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    const buffer = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // Cache a fresh Response built from the same bytes — the original `res` body was
    // already consumed by the manual read loop above and can't be cache.put() as-is.
    await cache.put(url, new Response(buffer, { headers: res.headers }));
    return buffer.buffer;
  }

  const buf = await res.arrayBuffer();
  await cache.put(url, new Response(buf.slice(0), { headers: res.headers }));
  return buf;
}

export interface DetectorModel {
  detector: ArrayBuffer;
}

let detectorLoadingPromise: Promise<DetectorModel> | null = null;

/** Loads (or serves from the persistent browser cache) the text-detection model. */
export function ensureDetectorLoaded(onProgress?: (loadedBytes: number, totalBytes: number | null) => void): Promise<DetectorModel> {
  if (!detectorLoadingPromise) {
    detectorLoadingPromise = (async () => {
      const cache = await caches.open(CACHE_NAME);
      const { url, isLocal } = await resolveSourceUrl("comictextdetector.pt.onnx", DETECTOR_URL);
      const detector = await fetchWithCache(cache, url, isLocal, onProgress);
      return { detector };
    })().catch((err) => {
      detectorLoadingPromise = null;
      throw err;
    });
  }
  return detectorLoadingPromise;
}

/** Apache-2.0, verified same architecture as kha-white/manga-ocr-base (see
 * docs/ocr-model-provenance.md) — fetching the UNMERGED `encoder_model.onnx`/
 * `decoder_model.onnx` pair specifically (not `decoder_model_merged.onnx`, which
 * loads and runs but produces degenerate output, confirmed via live diagnostics). */
const OCR_MODEL_ID = "DigitalLarynx/manga-ocr-onnx";

function ocrOnnxUrl(fileName: string): string {
  return `https://huggingface.co/${OCR_MODEL_ID}/resolve/main/onnx/${fileName}`;
}

export interface OcrOnnxModel {
  encoder: ArrayBuffer;
  decoder: ArrayBuffer;
}

let ocrOnnxLoadingPromise: Promise<OcrOnnxModel> | null = null;

/** Loads (or serves from the persistent browser cache) the OCR encoder+decoder ONNX
 * pair — no local-mirror support yet (unlike the detector's `OCR_MODELS_DIR` fallback
 * route), same as before this feature's `docs/ocr-model-provenance.md` "Nicht im
 * Umfang" note; only `onProgress` for the (larger) encoder download is reported. */
export function ensureOcrOnnxLoaded(onProgress?: (loadedBytes: number, totalBytes: number | null) => void): Promise<OcrOnnxModel> {
  if (!ocrOnnxLoadingPromise) {
    ocrOnnxLoadingPromise = (async () => {
      const cache = await caches.open(CACHE_NAME);
      const [encoder, decoder] = await Promise.all([
        fetchWithCache(cache, ocrOnnxUrl("encoder_model.onnx"), false, onProgress),
        fetchWithCache(cache, ocrOnnxUrl("decoder_model.onnx"), false),
      ]);
      return { encoder, decoder };
    })().catch((err) => {
      ocrOnnxLoadingPromise = null;
      throw err;
    });
  }
  return ocrOnnxLoadingPromise;
}

/** Forces a re-check of cache/local-mirror availability on the next ensure*Loaded()
 * call — e.g. after an operator populates DATA_DIR/models/ without a page reload. */
export function invalidateModelLoaderCache(): void {
  detectorLoadingPromise = null;
  ocrOnnxLoadingPromise = null;
}
