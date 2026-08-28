/**
 * Persistent, Cache-API-backed loader for the Auto-Bubbles/OCR ONNX models — same
 * "memoized promise, de-dupe concurrent callers" shape as editor/fontLoader.ts's
 * ensureFontsLoaded(), but backed by the browser's Cache API instead of an in-memory
 * Map: these files are hundreds of MB, so surviving a page reload (not re-fetching
 * every time) is a hard requirement, not an optimization. Unlike fontLoader.ts, a
 * failure here REJECTS rather than being swallowed to a warning — OCR simply cannot
 * run without its model, so the caller (useAutoBubblesRun.ts) needs a real error to
 * surface to the user.
 *
 * See docs/ocr-model-provenance.md for why these specific URLs were chosen (and which
 * ones must NOT be substituted without repeating that license check).
 */

import { authFetch } from "../api/authFetch";
import { apiUrl } from "../api/apiBase";

const CACHE_NAME = "comikumi-ocr-models-v1";

/** First-party, GPL-3.0, already-ONNX-exported — see docs/ocr-model-provenance.md's
 * "Clean first-party source found instead" section. Safe to fetch/cache today. */
const DETECTOR_URL = "https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.2.1/comictextdetector.pt.onnx";

/** No official ONNX export exists yet (see docs/ocr-model-provenance.md's "OCR model"
 * finding) — this is a placeholder pending a one-time PyTorch→ONNX conversion outside
 * this codebase's toolchain. `ensureOcrModelsLoaded()` deliberately throws rather than
 * silently fetching a wrong/unverified URL until this is replaced with a real,
 * license-checked source. */
const OCR_ENCODER_URL: string | null = null;
const OCR_DECODER_URL: string | null = null;

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
  onProgress?: (loadedBytes: number) => void
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
  // if the response body isn't a readable stream for some reason.
  if (res.body && onProgress) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded);
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

/** Loads (or serves from the persistent browser cache) the text-detection model —
 * the only model with a verified, usable source today (see module doc comment). */
export function ensureDetectorLoaded(onProgress?: (loadedBytes: number) => void): Promise<DetectorModel> {
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

/** Not implemented yet — see docs/ocr-model-provenance.md. Throws immediately rather
 * than attempting to fetch `null` URLs, so callers get an actionable error instead of
 * a confusing runtime crash deep inside a worker. */
export function ensureOcrModelsLoaded(): Promise<{ encoder: ArrayBuffer; decoder: ArrayBuffer }> {
  if (!OCR_ENCODER_URL || !OCR_DECODER_URL) {
    return Promise.reject(
      new Error(
        "OCR-Modell noch nicht verfügbar — es gibt noch keine geprüfte ONNX-Quelle dafür (siehe docs/ocr-model-provenance.md). Texterkennung kann noch nicht laufen; die Boxen-Erkennung (ensureDetectorLoaded) funktioniert bereits."
      )
    );
  }
  // Unreachable until the URLs above are filled in with a real, license-checked
  // source — left structurally ready (same cache/fetch shape as ensureDetectorLoaded)
  // so wiring it in later is a small diff, not a rewrite.
  throw new Error("unreachable");
}

/** Forces a re-check of cache/local-mirror availability on the next ensure*Loaded()
 * call — e.g. after an operator populates DATA_DIR/models/ without a page reload. */
export function invalidateModelLoaderCache(): void {
  detectorLoadingPromise = null;
}
