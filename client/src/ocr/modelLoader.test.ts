import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// modelLoader.ts memoizes its loading promise at module scope, so each test needs a
// fresh module instance — dynamic-imported per test after the mocks for that test are
// in place (same "set up the environment, then import" requirement as other modules
// in this codebase that read module-scope state once).
async function freshModelLoader() {
  vi.resetModules();
  return import("./modelLoader");
}

function fakeResponse(bytes: Uint8Array): Response {
  return new Response(bytes.buffer as ArrayBuffer, { status: 200, headers: { "content-type": "application/octet-stream" } });
}

describe("ensureDetectorLoaded", () => {
  let cachePut: ReturnType<typeof vi.fn>;
  let cacheMatch: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cachePut = vi.fn().mockResolvedValue(undefined);
    cacheMatch = vi.fn().mockResolvedValue(undefined); // cache miss by default
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({ put: cachePut, match: cacheMatch }),
    });
    // Node's own built-in localStorage throws without a configured backing file (see
    // the "--localstorage-file was provided without a valid path" warning) — stub it
    // so authFetch.ts's getAuthToken() (called on every authFetch()) doesn't blow up
    // before ever reaching the fetch mock below.
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      // The loader HEAD-probes a local server mirror before falling back to the
      // external URL — simulate "no local mirror" (probe fails) so tests exercise the
      // external-fetch path unless a test overrides this mock itself.
      if (init?.method === "HEAD") return new Response(null, { status: 404 });
      return fakeResponse(new Uint8Array([1, 2, 3, 4]));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and caches the model on a cache miss", async () => {
    const { ensureDetectorLoaded } = await freshModelLoader();
    const result = await ensureDetectorLoaded();
    expect(result.detector.byteLength).toBeGreaterThan(0);
    // One HEAD probe (local-mirror check) + one real GET.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cachePut).toHaveBeenCalledTimes(1);
  });

  it("serves from the Cache API on a cache hit, without fetching the model itself", async () => {
    cacheMatch.mockResolvedValue(fakeResponse(new Uint8Array([9, 9, 9])));
    const { ensureDetectorLoaded } = await freshModelLoader();
    await ensureDetectorLoaded();
    // Only the local-mirror HEAD probe — never a GET for the model bytes, since the
    // cache already had them.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "HEAD" }));
    expect(cachePut).not.toHaveBeenCalled();
  });

  it("de-dupes concurrent calls into a single fetch", async () => {
    const { ensureDetectorLoaded } = await freshModelLoader();
    const [a, b] = await Promise.all([ensureDetectorLoaded(), ensureDetectorLoaded()]);
    expect(a).toBe(b); // same object reference — one shared promise, not two loads
    expect(cachePut).toHaveBeenCalledTimes(1);
  });

  it("prefers a reachable local server mirror over the external URL", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { status: 200 }); // mirror reachable
      expect(url).toContain("/api/ocr-models/");
      return fakeResponse(new Uint8Array([5, 6, 7]));
    });
    const { ensureDetectorLoaded } = await freshModelLoader();
    await ensureDetectorLoaded();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ensureOcrModelsLoaded", () => {
  it("rejects with an actionable error instead of fetching a null URL", async () => {
    const { ensureOcrModelsLoaded } = await freshModelLoader();
    await expect(ensureOcrModelsLoaded()).rejects.toThrow(/noch nicht verfügbar/);
  });
});
