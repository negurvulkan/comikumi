import { Shape } from "react-konva";
import { cutPanelReplacementFileForLanguage, resolvePanelForLanguage, type Panel } from "../../../shared/src/layoutSchema";
import { drawCutPanelContent } from "../export/cutPanel";
import { api } from "../api/client";
import { useHtmlImage } from "./useHtmlImage";

interface Props {
  panel: Panel;
  image: HTMLImageElement;
  scale: number;
  imageWidth: number;
  imageHeight: number;
  activeLanguage: string;
}

/**
 * Renders a Cut-Panel's detached content in the live editor preview — a raw Canvas-2D
 * draw (same `<Shape sceneFunc={...}>` + `ctx._context` pattern BubbleShape.tsx already
 * uses for its background/text drawing), reusing the exact same `drawCutPanelContent()`
 * used by the PNG exporter so both stay pixel-identical. Rendered between the page
 * background and PanelShape's own outline, so the dashed outline/handles/lock icon
 * still sit visibly on top.
 */
export function CutPanelContentShape({ panel, image, scale, imageWidth, imageHeight, activeLanguage }: Props) {
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
        drawCutPanelContent(ctx._context, resolved, image, imageWidth, imageHeight, scale, replacementImage);
      }}
    />
  );
}
