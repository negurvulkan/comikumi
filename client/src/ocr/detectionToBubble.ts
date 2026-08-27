import { v4 as uuid } from "uuid";
import { createBubble, type Bubble } from "../../../shared/src/layoutSchema";
import type { DetectedRegion } from "./types";

/** Turns one accepted detection into a plain rect Bubble, its recognized text filled
 * into `languageCode` (the editor's currently active language tab — see
 * useAutoBubblesRun.ts, which reads `activeLanguage` for this) — everything else
 * (style, panel/character assignment) is left at createBubble()'s own defaults, same
 * as a manually-drawn bubble; the user refines those afterward like any other bubble. */
export function detectionToBubble(region: DetectedRegion, languageCode: string): Bubble {
  return createBubble({
    id: uuid(),
    shape: "rect",
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    text: { [languageCode]: region.recognizedText },
  });
}
