import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Panel } from "../../../shared/src/layoutSchema";
import { polygonBounds } from "../../../shared/src/layoutSchema";
import { useHtmlImage } from "./useHtmlImage";

interface Props {
  imageUrl: string;
  panel: Panel;
  /** Target preview width in px — height follows the panel's own aspect ratio. */
  width?: number;
}

/** Crops a Panel's bounding-box region out of the full-res page source image into a
 * small `<canvas>` preview — used by TranslatorContextPanel.tsx so a translator can see
 * the current bubble's panel without scrolling the main canvas. Bounding-box crop, not a
 * true polygon mask (simpler, and panels are usually close to their bounding box anyway
 * since they mark a region rather than an exact shape). */
export function PanelCropPreview({ imageUrl, panel, width = 220 }: Props) {
  const { t } = useTranslation();
  const image = useHtmlImage(imageUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bounds = polygonBounds(panel.points);
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const targetHeight = Math.round(width * (h / w));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, bounds.minX, bounds.minY, w, h, 0, 0, canvas.width, canvas.height);
  }, [image, bounds.minX, bounds.minY, w, h]);

  if (!image) return <p className="hint">{t("common.loading")}</p>;

  return <canvas ref={canvasRef} width={width} height={targetHeight} style={{ width: "100%", borderRadius: 4, border: "1px solid var(--border)" }} />;
}
