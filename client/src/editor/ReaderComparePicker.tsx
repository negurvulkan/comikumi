import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type PageSummary } from "../api/client";
import { Modal } from "./Modal";

const MAX_COMPARE_PAGES = 4;

interface Props {
  volumeId: string;
  /** Pre-checked when reopening the picker to adjust an already-active comparison —
   * see ReaderToolStrip.tsx's "Vergleichen…" button, which always opens this (both for
   * a first-time pick and to edit the current set). */
  initialSelection: string[];
  onConfirm: (pages: string[]) => void;
  onClose: () => void;
}

/** Thumbnail grid to pick up to MAX_COMPARE_PAGES arbitrary pages for side-by-side
 * comparison — same `.card-grid`/`api.pageThumbnailUrl` visual as PageGrid.tsx's own
 * page overview, just checkbox-select instead of link-to-open. Selection order is
 * preserved (not re-sorted by page name) so the comparison lays out left-to-right in
 * the order the reviewer picked, which is more useful for "is A consistent with B"
 * checks than an arbitrary alphabetical order would be. */
export function ReaderComparePicker({ volumeId, initialSelection, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [selected, setSelected] = useState<string[]>(initialSelection);

  useEffect(() => {
    api.listPages(volumeId).then(setPages);
  }, [volumeId]);

  function toggle(page: string) {
    setSelected((prev) => {
      if (prev.includes(page)) return prev.filter((p) => p !== page);
      if (prev.length >= MAX_COMPARE_PAGES) return prev;
      return [...prev, page];
    });
  }

  return (
    <Modal onClose={onClose}>
      <div className="inspector" style={{ width: 640, maxWidth: "90vw", maxHeight: "80vh" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("reader.comparePickerTitle")}</p>
        <p className="hint" style={{ margin: 0 }}>
          {t("reader.comparePickerHint", { max: MAX_COMPARE_PAGES })}
        </p>
        {!pages ? (
          <p className="hint">{t("common.loading")}</p>
        ) : (
          <div className="card-grid" style={{ overflowY: "auto", maxHeight: "50vh" }}>
            {pages.map((p) => {
              const isSelected = selected.includes(p.page);
              const disabled = !isSelected && selected.length >= MAX_COMPARE_PAGES;
              return (
                <button
                  key={p.page}
                  type="button"
                  className="card"
                  style={{
                    opacity: disabled ? 0.4 : 1,
                    outline: isSelected ? "2px solid var(--accent)" : undefined,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                  disabled={disabled}
                  onClick={() => toggle(p.page)}
                >
                  <img src={api.pageThumbnailUrl(volumeId, p.page)} alt={p.page} loading="lazy" />
                  <div className="label">
                    {isSelected ? "✓ " : ""}
                    {p.page}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="primary" disabled={selected.length === 0} onClick={() => onConfirm(selected)} style={{ flex: 1 }}>
            {t("reader.comparePickerConfirm", { count: selected.length })}
          </button>
          <button onClick={onClose} style={{ flex: 1 }}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
