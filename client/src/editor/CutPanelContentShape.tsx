import { Shape } from "react-konva";
import type { Panel } from "../../../shared/src/layoutSchema";
import { drawCutPanelContent } from "../export/cutPanel";

interface Props {
  panel: Panel;
  image: HTMLImageElement;
  scale: number;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Renders a Cut-Panel's detached content in the live editor preview — a raw Canvas-2D
 * draw (same `<Shape sceneFunc={...}>` + `ctx._context` pattern BubbleShape.tsx already
 * uses for its background/text drawing), reusing the exact same `drawCutPanelContent()`
 * used by the PNG exporter so both stay pixel-identical. Rendered between the page
 * background and PanelShape's own outline, so the dashed outline/handles/lock icon
 * still sit visibly on top.
 */
export function CutPanelContentShape({ panel, image, scale, imageWidth, imageHeight }: Props) {
  if (!panel.cut) return null;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        drawCutPanelContent(ctx._context, panel, image, imageWidth, imageHeight, scale);
      }}
    />
  );
}
