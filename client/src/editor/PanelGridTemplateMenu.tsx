import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Point } from "../../../shared/src/layoutSchema";
import { boxCorners } from "../../../shared/src/layoutSchema";
import { PanelGridToolIcon } from "./Icons";

interface Template {
  id: string;
  rows: number;
  cols: number;
}

const TEMPLATES: Template[] = [
  { id: "1x1", rows: 1, cols: 1 },
  { id: "2stack", rows: 2, cols: 1 },
  { id: "3stack", rows: 3, cols: 1 },
  { id: "2x2", rows: 2, cols: 2 },
  { id: "2x3", rows: 2, cols: 3 },
];

const GUTTER = 20;

/** Evenly divides a `width`x`height` page into `rows`x`cols` cells (with a fixed gutter
 * between them) and returns one rectangular polygon per cell, in reading order
 * (row-major, top-to-bottom/left-to-right) — the starting point for the panel-grid
 * quick-start templates below. */
export function gridTemplateRects(width: number, height: number, rows: number, cols: number): Point[][] {
  const cellWidth = (width - GUTTER * (cols - 1)) / cols;
  const cellHeight = (height - GUTTER * (rows - 1)) / rows;
  const rects: Point[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * (cellWidth + GUTTER);
      const y = r * (cellHeight + GUTTER);
      rects.push(boxCorners(x, y, cellWidth, cellHeight));
    }
  }
  return rects;
}

interface Props {
  imageWidth: number;
  imageHeight: number;
  onCreate: (rects: Point[][]) => void;
  disabled?: boolean;
}

/** Toolbar popover offering a handful of common panel-grid layouts (see
 * editorStore.ts's `addPanel`'s optional `initialCut` — every panel created here starts
 * pre-activated as a base-level Cut-Panel in "replace with own image" mode, so the user
 * just has to click each one and assign its finished artwork) — the quick-start half of
 * the "build a page panel-by-panel from a blank page" workflow (see docs/FEATURES.md). */
export function PanelGridTemplateMenu({ imageWidth, imageHeight, onCreate, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  function pick(template: Template) {
    onCreate(gridTemplateRects(imageWidth, imageHeight, template.rows, template.cols));
    setOpen(false);
  }

  return (
    <div className="language-manager">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`tool-btn${open ? " active" : ""}`}
        title={t("editor.toolStrip.panelGrid")}
        disabled={disabled}
      >
        <PanelGridToolIcon />
      </button>
      {open && (
        <div className="language-manager-panel">
          <p className="report-heading" style={{ margin: "4px 0" }}>
            {t("editor.toolStrip.panelGridHint")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TEMPLATES.map((template) => (
              <button key={template.id} type="button" onClick={() => pick(template)}>
                {t(`editor.toolStrip.panelGridTemplate.${template.id}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
