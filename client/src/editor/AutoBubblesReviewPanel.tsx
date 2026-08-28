import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DetectedRegion } from "../ocr/types";
import { Modal } from "./Modal";

interface Props {
  regions: DetectedRegion[];
  onInsert: (accepted: DetectedRegion[]) => void;
  onCancel: () => void;
}

/** Review-before-commit step for Auto-Bubbles detections (see useAutoBubblesRun.ts's
 * doc comment) — one row per detected region, editable recognized text (OCR isn't
 * wired in yet, see docs/ocr-model-provenance.md, so this starts empty and the user
 * types the source text here same as they would in a freshly drawn bubble) and an
 * accept/reject toggle, defaulting to accepted (most detections from this model
 * family are real bubbles, not hallucinated boxes — the user deselects false
 * positives rather than opting in one by one). Nothing reaches the layout until
 * "Insert" is clicked; "Cancel"/Escape/backdrop-click discard everything. */
export function AutoBubblesReviewPanel({ regions, onInsert, onCancel }: Props) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(regions.map((r) => r.id)));
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(regions.map((r) => [r.id, r.recognizedText]))
  );

  function toggle(id: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleInsert() {
    const result = regions.filter((r) => accepted.has(r.id)).map((r) => ({ ...r, recognizedText: texts[r.id] ?? "" }));
    onInsert(result);
  }

  return (
    <Modal onClose={onCancel}>
      <div className="inspector" style={{ maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("ocr.reviewTitle", { count: regions.length })}</p>
        <p className="hint" style={{ margin: 0 }}>{t("ocr.reviewHint")}</p>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {regions.map((region, i) => (
            <div key={region.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <input
                type="checkbox"
                checked={accepted.has(region.id)}
                onChange={() => toggle(region.id)}
                style={{ marginTop: 6 }}
                title={t("ocr.acceptRegion")}
              />
              <div style={{ flex: "1 1 auto" }}>
                <div className="hint" style={{ margin: 0 }}>{t("ocr.regionLabel", { index: i + 1 })}</div>
                <textarea
                  value={texts[region.id] ?? ""}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [region.id]: e.target.value }))}
                  disabled={!accepted.has(region.id)}
                  placeholder={t("ocr.textPlaceholder")}
                  style={{ width: "100%", minHeight: 44 }}
                />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="primary" onClick={handleInsert} disabled={accepted.size === 0}>
            {t("ocr.insertCount", { count: accepted.size })}
          </button>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
