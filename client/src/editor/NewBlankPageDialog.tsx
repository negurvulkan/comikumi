import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface Props {
  defaultWidth: number;
  defaultHeight: number;
  onCreate: (width: number, height: number) => void;
  onClose: () => void;
}

/** Small size-prompt shown before creating a blank page (see PageGrid.tsx's
 * "+ New blank page" action) — the only new UI needed for that feature, since the
 * actual page gets created by drawing a blank canvas and sending it through the
 * existing page-upload endpoint. */
export function NewBlankPageDialog({ defaultWidth, defaultHeight, onCreate, onClose }: Props) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);

  return (
    <Modal onClose={onClose}>
      <div className="inspector" style={{ maxWidth: 280 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("pageGrid.newBlankPageTitle")}</p>
        <label>
          {t("pageGrid.newBlankPageWidthLabel")}
          <input type="number" min={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <label>
          {t("pageGrid.newBlankPageHeightLabel")}
          <input type="number" min={1} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            className="primary"
            disabled={width <= 0 || height <= 0}
            onClick={() => onCreate(Math.round(width), Math.round(height))}
          >
            {t("pageGrid.newBlankPageCreate")}
          </button>
          <button onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </div>
    </Modal>
  );
}
