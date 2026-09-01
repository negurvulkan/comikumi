import fs from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { findFontFileForFamily } from "./fontResolver.js";

/**
 * Resolves the app's own `fontFamily` string (a filename-derived alias, see
 * fontResolver.ts's doc comment) to the font file's REAL PostScript name — the value
 * Photoshop's Type-tool engine needs to match an installed font (`TextStyle.font.name`
 * in ag-psd's LayerTextData, see psdExport.ts). The app's own alias is not reliably the
 * same string; a real PSD text layer built with the wrong name either falls back to a
 * substitute font in Photoshop or fails to match at all.
 *
 * Returns `null` when the family has no embeddable (.ttf/.otf) file, or the file has no
 * readable PostScript name — both cases mean "not safe enough for a real PSD text
 * layer," the caller's signal to fall back to a plain raster layer instead.
 *
 * Cached process-lifetime by family name, same "font files never change under the same
 * name" reasoning as pageRaster.ts's font-registration cache (Batch D) — a fresh upload
 * gets a new filename/alias, so the same alias always resolves to the same bytes.
 */
const postscriptNameCache = new Map<string, string | null>();

export async function resolvePsdFontName(family: string): Promise<string | null> {
  if (postscriptNameCache.has(family)) return postscriptNameCache.get(family)!;
  const result = await resolveUncached(family);
  postscriptNameCache.set(family, result);
  return result;
}

async function resolveUncached(family: string): Promise<string | null> {
  const filePath = await findFontFileForFamily(family);
  if (!filePath) return null;
  try {
    const buffer = await fs.readFile(filePath);
    const font = fontkit.create(buffer);
    return font.postscriptName ?? null;
  } catch {
    return null;
  }
}
