import fs from "node:fs/promises";
import path from "node:path";
import { IMAGES_DIR } from "./paths.js";
import { getActiveProjectAssetDir } from "./projectStore.js";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves an ImageElement/Cut-Panel-replacement `fileName` (a "/"-joined relative path
 * — see client/src/api/client.ts's imagesFileUrl()/joinAssetPath() folder-management
 * convention, e.g. "effects/boom.png") to an absolute filesystem path, for server-side
 * rendering (vector-PDF/PSD export) that needs to read the actual bytes directly rather
 * than fetch them over HTTP. Same project-wins-on-collision merge order as
 * assetRouter.ts's own GET /file/:fileName lookup. Returns null if not found anywhere.
 */
export async function resolveImageFilePath(fileName: string): Promise<string | null> {
  const projectDir = await getActiveProjectAssetDir("images");
  if (projectDir) {
    const candidate = path.join(projectDir, fileName);
    if (await fileExists(candidate)) return candidate;
  }
  const candidate = path.join(IMAGES_DIR, fileName);
  return (await fileExists(candidate)) ? candidate : null;
}
