import { api, type FontEntry } from "../api/client";

const registered = new Set<string>();

/** Registers every font via the FontFace API so both DOM preview and <canvas> text use it. */
export async function registerFonts(fonts: FontEntry[]): Promise<void> {
  await Promise.all(
    fonts.map(async (f) => {
      if (registered.has(f.family)) return;
      try {
        const face = new FontFace(f.family, `url(${f.url})`);
        await face.load();
        document.fonts.add(face);
        registered.add(f.family);
      } catch (err) {
        console.warn(`Font "${f.family}" konnte nicht geladen werden`, err);
      }
    })
  );
}

export const FALLBACK_FONTS = ["Anime Ace", "Comic Sans MS", "Arial", "sans-serif"];

let fontsReadyPromise: Promise<void> | null = null;

/**
 * Loads + registers every uploaded font exactly once, independent of whether the
 * FontPicker (inspector) has ever been mounted. Both the live canvas preview and
 * the PNG export must await this before drawing text, otherwise one of them can
 * silently render with a browser fallback font while the other uses the real one
 * — same nominal font size, but visually a completely different glyph size/shape.
 */
export function ensureFontsLoaded(): Promise<void> {
  if (!fontsReadyPromise) {
    fontsReadyPromise = api
      .listFonts()
      .then((fonts) => registerFonts(fonts))
      .catch((err) => {
        console.warn("Fonts konnten nicht vom Server geladen werden", err);
      });
  }
  return fontsReadyPromise;
}

/** Forces re-fetch + re-registration on the next ensureFontsLoaded() call (e.g. after a
 * new upload, or after switching to a different project — clearing `registered` too is
 * essential there: it's keyed only by font family name, so without clearing it, two
 * projects that happen to use the same family name (e.g. both "Title") would silently
 * keep using whichever project's file was registered first. */
export function invalidateFontsCache(): void {
  fontsReadyPromise = null;
  registered.clear();
}
