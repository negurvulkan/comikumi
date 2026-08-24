import { Shape } from "react-konva";
import { cutPanelReplacementFileForLanguage, resolvePanelForLanguage, type Panel } from "../../../shared/src/layoutSchema";
import { drawCutPanelForeground, fillCutPanelHole } from "../../../shared/src/rendering/cutPanel";
import { api } from "../api/client";
import { useHtmlImage } from "./useHtmlImage";

interface Props {
  panel: Panel;
  image: HTMLImageElement;
  scale: number;
  imageWidth: number;
  imageHeight: number;
  activeLanguage: string;
  /** Which half of the draw to do — see this component's doc comment for why callers
   * must render every panel's "hole" phase before any panel's "foreground" phase. */
  phase: "hole" | "foreground";
}

/**
 * Renders one half of a Cut-Panel's detached content in the live editor preview — a raw
 * Canvas-2D draw (same `<Shape sceneFunc={...}>` + `ctx._context` pattern BubbleShape.tsx
 * already uses for its background/text drawing), reusing the exact same
 * fillCutPanelHole()/drawCutPanelForeground() the PNG/PSD/PDF exporters use so all stay
 * pixel-identical. Split into two phases (rather than one shape doing fill-then-draw, the
 * way this component used to) because PageCanvas.tsx renders one of these per Cut-Panel:
 * with N panels each a separate Shape, Konva paints them in list order, so if two panels
 * swap positions, whichever's Shape comes later in the list would fill-then-draw AFTER
 * the earlier one already drew its content into what is now the later panel's vacated
 * spot — erasing it. PageCanvas.tsx instead renders every panel's "hole" phase first
 * (in any order, they never spatially conflict with each other), then every panel's
 * "foreground" phase (order only matters for who wins on transient overlap, e.g. while
 * dragging — see PageCanvas.tsx's selected-last sort). Rendered between the page
 * background and PanelShape's own outline, so the dashed outline/handles/lock icon still
 * sit visibly on top.
 */
export function CutPanelContentShape({ panel, image, scale, imageWidth, imageHeight, activeLanguage, phase }: Props) {
  // Resolve the panel for the active language first — the same panel can be a plain
  // untouched marker in one language and a moved/removed/replaced Cut-Panel in another.
  const resolved = resolvePanelForLanguage(panel, activeLanguage);

  // Same load pattern as ImageElementShape.tsx: resolve the per-language file name, build
  // its asset URL, load it — undefined until loaded (or if no replacement is configured).
  const fileName = cutPanelReplacementFileForLanguage(resolved.cut, activeLanguage);
  const replacementUrl = fileName ? api.imagesFileUrl(fileName) : undefined;
  const replacementImage = useHtmlImage(replacementUrl);

  if (!resolved.cut) return null;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        if (phase === "hole") fillCutPanelHole(ctx._context, resolved, scale);
        else drawCutPanelForeground(ctx._context, resolved, image, imageWidth, imageHeight, scale, replacementImage);
      }}
    />
  );
}
