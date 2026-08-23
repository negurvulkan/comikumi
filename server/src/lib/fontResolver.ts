import fs from "node:fs/promises";
import path from "node:path";
import { FONTS_DIR } from "./paths.js";
import { getActiveProjectAssetDir } from "./projectStore.js";

/** pdf-lib/@pdf-lib/fontkit embed real TrueType/OpenType outlines — .woff/.woff2 (which
 * the in-browser FontPicker also accepts, since browsers can render them directly) can't
 * be embedded as PDF vector fonts. A family only available as .woff/.woff2 falls back to
 * `null` here (see findFontFileForFamily's doc comment) rather than silently embedding
 * nothing or crashing. */
const PDF_EMBEDDABLE_EXT = new Set([".ttf", ".otf"]);

async function findInDir(dir: string, family: string): Promise<string | null> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  for (const fileName of entries) {
    const ext = path.extname(fileName).toLowerCase();
    if (!PDF_EMBEDDABLE_EXT.has(ext)) continue;
    if (path.basename(fileName, ext) === family) return path.join(dir, fileName);
  }
  return null;
}

/**
 * Resolves a bubble/curved-text's `fontFamily` (derived, project-wide, from a font
 * file's own name — see server/src/lib/assetRouter.ts's `enrichEntry` for fonts) to an
 * absolute .ttf/.otf path for PDF embedding. Same project-wins-on-collision merge order
 * as the asset router's own GET /file/:fileName lookup — checks the project's own fonts
 * folder (if `assetsDir` is configured) before falling back to the shared global one.
 * Returns null if no embeddable (.ttf/.otf) file matches — callers must decide their own
 * fallback (e.g. skip the page/report an error), not silently substitute a system font,
 * since that would visibly diverge from the live preview.
 */
export async function findFontFileForFamily(family: string): Promise<string | null> {
  const projectDir = await getActiveProjectAssetDir("fonts");
  if (projectDir) {
    const inProject = await findInDir(projectDir, family);
    if (inProject) return inProject;
  }
  return findInDir(FONTS_DIR, family);
}
