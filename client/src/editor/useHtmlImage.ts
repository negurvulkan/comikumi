import { useEffect, useState } from "react";

// Batch W — Webtoon support: a soft ceiling, not a hard one — decoding still succeeds,
// this just surfaces a console signal if a genuinely pathological upload (well beyond a
// realistic webtoon strip) ever shows up, before it's discovered the hard way in some
// downstream canvas-size guard instead.
const LARGE_IMAGE_MEGAPIXEL_WARNING = 100_000_000;

export function useHtmlImage(src: string | undefined): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);

  useEffect(() => {
    if (!src) {
      setImage(undefined);
      return;
    }
    const img = new Image();
    // "anonymous" strips cookies from the request — breaks a split client/server
    // deployment behind the demo broker (broker/), which routes each visitor to their
    // own container via a session cookie: an anonymous cross-origin image load would
    // arrive with no cookie and either hit a different (fresh, unrelated) container or
    // get rejected outright. "use-credentials" sends the cookie while still avoiding
    // canvas tainting, since the broker's CORS response already sends an exact
    // Access-Control-Allow-Origin + Access-Control-Allow-Credentials (see broker/src/
    // app.ts) rather than a wildcard. A harmless no-op for the normal same-origin/
    // Electron packaging, which sets no cookies at all.
    img.crossOrigin = "use-credentials";
    img.src = src;
    const handleLoad = () => {
      const megapixels = img.naturalWidth * img.naturalHeight;
      if (megapixels > LARGE_IMAGE_MEGAPIXEL_WARNING) {
        console.warn(
          `useHtmlImage: loaded a very large image (${img.naturalWidth}×${img.naturalHeight}, ${(megapixels / 1_000_000).toFixed(0)}MP) from ${src} — some export paths (PNG canvas size, PSD per-element canvases) have hard limits well below this.`
        );
      }
      setImage(img);
    };
    img.addEventListener("load", handleLoad);
    return () => img.removeEventListener("load", handleLoad);
  }, [src]);

  return image;
}
