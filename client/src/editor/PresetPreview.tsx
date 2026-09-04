import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";
import { ensureFontsLoaded } from "./fontLoader";
import { ensureSvgBubbleBoundaryLoaded, getCachedSvgBubbleBoundary } from "../export/svgBubbleGeometry";
import { drawBubblePreview, drawCurvedTextPreview } from "./presetPreviewRender";

interface Props {
  text: PresetTextFields;
  background: PresetBackgroundFields;
}

const CANVAS_SIZE = { width: 320, height: 260 };

/** Right column of the redesigned PresetManager — a live, non-interactive preview of
 * the in-progress (possibly unsaved) preset, redrawn on every field edit. Plain
 * <canvas> + useEffect imperative redraw, same established pattern as
 * PanelCropPreview.tsx — deliberately not react-konva, since nothing here is
 * interactive (see presetPreviewRender.ts's doc comment for why this stays
 * pixel-identical to a real linked bubble/curved-text). */
export function PresetPreview({ text, background }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"bubble" | "curvedText">("bubble");
  const [sampleText, setSampleText] = useState(() => t("managers.presets.previewSampleTextDefault"));
  const [fontsVersion, setFontsVersion] = useState(0);
  const [svgVersion, setSvgVersion] = useState(0);

  useEffect(() => {
    ensureFontsLoaded().then(() => setFontsVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    if (mode === "bubble" && background.bubbleStyle === "svg" && background.svgFileName) {
      ensureSvgBubbleBoundaryLoaded(background.svgFileName).then(() => setSvgVersion((v) => v + 1));
    }
  }, [mode, background.bubbleStyle, background.svgFileName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    if (mode === "bubble") {
      const svgBoundary = background.svgFileName ? getCachedSvgBubbleBoundary(background.svgFileName) : null;
      drawBubblePreview(ctx, CANVAS_SIZE, text, background, sampleText, svgBoundary);
    } else {
      drawCurvedTextPreview(ctx, CANVAS_SIZE, text, sampleText);
    }
    // fontsVersion/svgVersion aren't read directly but must trigger a redraw once fonts/
    // the SVG contour finish loading asynchronously after the initial (possibly
    // fallback-font/no-contour) draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, background, sampleText, mode, fontsVersion, svgVersion]);

  return (
    <div className="inspector preset-preview-panel">
      <p style={{ margin: 0, fontWeight: 600 }}>{t("managers.presets.previewHeading")}</p>

      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className={mode === "bubble" ? "primary" : undefined} onClick={() => setMode("bubble")}>
          {t("managers.presets.previewModeBubble")}
        </button>
        <button type="button" className={mode === "curvedText" ? "primary" : undefined} onClick={() => setMode("curvedText")}>
          {t("managers.presets.previewModeCurvedText")}
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE.width}
        height={CANVAS_SIZE.height}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, width: "100%", height: "auto" }}
      />

      <label>
        {t("managers.presets.previewSampleTextLabel")}
        <input type="text" value={sampleText} onChange={(e) => setSampleText(e.target.value)} />
      </label>
    </div>
  );
}
