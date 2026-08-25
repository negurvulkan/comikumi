import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Bubble, Panel } from "../../../shared/src/layoutSchema";
import { polygonBounds, resolvePanelForLanguage, panelDisplayLabel } from "../../../shared/src/layoutSchema";
import { groupBubblesByPanel, type ReadingDirection } from "./reportUtils";
import { useHtmlImage } from "./useHtmlImage";
import { FocusTargetIcon } from "./Icons";

const THUMB_SIZE = 72;

interface ThumbProps {
  imageUrl: string;
  panel: Panel;
  index: number;
  activeLanguage: string;
  selected: boolean;
  onClick: () => void;
}

/** One clickable panel crop, same bounding-box-crop math as PanelCropPreview.tsx but a
 * single static draw (no zoom/pan interaction needed for a picker thumbnail) — redraws
 * only when the panel's own resolved geometry or the source image changes. */
function PanelThumb({ imageUrl, panel, index, activeLanguage, selected, onClick }: ThumbProps) {
  const { t } = useTranslation();
  const image = useHtmlImage(imageUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bounds = polygonBounds(resolvePanelForLanguage(panel, activeLanguage).points);
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fit = Math.min(THUMB_SIZE / w, THUMB_SIZE / h);
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    ctx.save();
    ctx.translate(THUMB_SIZE / 2, THUMB_SIZE / 2);
    ctx.scale(fit, fit);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(image, bounds.minX, bounds.minY, w, h, 0, 0, w, h);
    ctx.restore();
  }, [image, bounds.minX, bounds.minY, w, h]);

  return (
    <button
      type="button"
      className={`reader-panel-thumb${selected ? " selected" : ""}`}
      onClick={onClick}
      title={t("reader.jumpToPanel", { label: panelDisplayLabel(panel, index) })}
    >
      <canvas ref={canvasRef} width={THUMB_SIZE} height={THUMB_SIZE} />
      <FocusTargetIcon />
    </button>
  );
}

interface Props {
  imageUrl: string;
  panels: Panel[];
  bubbles: Bubble[];
  activeLanguage: string;
  readingDirection: ReadingDirection;
  selectedPanelId: string | null;
  onFocusPanel: (panelId: string) => void;
}

/** Horizontal strip of every panel on the page, in reading order — click one to zoom
 * the main canvas straight to it (PageCanvas.tsx's focusRequest prop). Order comes
 * from groupBubblesByPanel() (reportUtils.ts), the same helper the report/script
 * sidebar already use, so panel order here never disagrees with those. */
export function ReaderPanelStrip({ imageUrl, panels, bubbles, activeLanguage, readingDirection, selectedPanelId, onFocusPanel }: Props) {
  const { t } = useTranslation();
  const orderedIds = groupBubblesByPanel(bubbles, panels, activeLanguage, readingDirection)
    .map((g) => g.panelId)
    .filter((id): id is string => id !== null);

  if (orderedIds.length === 0) return null;

  return (
    <div className="reader-panel-strip">
      <span className="hint" style={{ flexShrink: 0 }}>
        {t("reader.panelsLabel")}
      </span>
      {orderedIds.map((id) => {
        const panel = panels.find((p) => p.id === id);
        if (!panel) return null;
        return (
          <PanelThumb
            key={id}
            imageUrl={imageUrl}
            panel={panel}
            index={panels.findIndex((p) => p.id === id)}
            activeLanguage={activeLanguage}
            selected={id === selectedPanelId}
            onClick={() => onFocusPanel(id)}
          />
        );
      })}
    </div>
  );
}
