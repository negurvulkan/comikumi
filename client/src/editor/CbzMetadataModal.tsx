import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import {
  CBZ_AGE_RATINGS,
  CBZ_MANGA_VALUES,
  CBZ_PAGE_TYPES,
  type CbzAgeRating,
  type CbzManga,
  type CbzMetadata,
  type CbzPageEntry,
  type CbzPageType,
} from "../../../shared/src/cbz";

interface Props {
  /** Ordered list of page names that will actually be packaged into the CBZ (already
   * filtered to image-only exports and sorted by real page order) — see
   * ExportViewer.tsx's orderedExportedPages, which mirrors the server's own filtering
   * in export.ts so the `image` indices sent back line up with what the server builds. */
  pages: string[];
  initial: Partial<CbzMetadata>;
  onConfirm: (metadata: CbzMetadata) => void;
  onClose: () => void;
}

type Tab = "basic" | "credits" | "publication" | "categorization" | "pages";

const TABS: Tab[] = ["basic", "credits", "publication", "categorization", "pages"];

type StringFieldKey = {
  [K in keyof CbzMetadata]-?: CbzMetadata[K] extends string | undefined ? K : never;
}[keyof CbzMetadata];

function textField(
  metadata: CbzMetadata,
  set: (key: StringFieldKey, value: string) => void,
  key: StringFieldKey,
  label: string,
  opts?: { maxLength?: number; type?: string; placeholder?: string }
) {
  return (
    <label>
      {label}
      <input
        type={opts?.type ?? "text"}
        maxLength={opts?.maxLength}
        placeholder={opts?.placeholder}
        value={metadata[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
}

/** Full ComicInfo.xml field set (see shared/src/cbz.ts), grouped into tabs so the
 * dialog stays navigable instead of one long scroll. PageCount is always server-derived
 * and has no field here; Manga defaults to the project's actual reading direction
 * (passed in via `initial`) but stays editable per-export. */
export function CbzMetadataModal({ pages, initial, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("basic");
  const [metadata, setMetadata] = useState<CbzMetadata>(initial);
  const [pageEntries, setPageEntries] = useState<CbzPageEntry[]>(() =>
    pages.map((_, index) => ({
      image: index,
      type: index === 0 ? "FrontCover" : index === pages.length - 1 ? "BackCover" : "Story",
      doublePage: false,
    }))
  );

  function set(key: StringFieldKey, value: string) {
    setMetadata((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function setAgeRating(value: string) {
    setMetadata((prev) => ({ ...prev, ageRating: value as CbzAgeRating }));
  }

  function setManga(value: string) {
    setMetadata((prev) => ({ ...prev, manga: value as CbzManga }));
  }

  function setPageType(index: number, value: CbzPageType) {
    setPageEntries((prev) => prev.map((p, i) => (i === index ? { ...p, type: value } : p)));
  }

  function setPageDoublePage(index: number, value: boolean) {
    setPageEntries((prev) => prev.map((p, i) => (i === index ? { ...p, doublePage: value } : p)));
  }

  function handleConfirm() {
    onConfirm({ ...metadata, pages: pageEntries });
  }

  return (
    <Modal onClose={onClose}>
      <div className="inspector" style={{ width: 640, maxWidth: "90vw", maxHeight: "85vh" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("exportViewer.cbzModalTitle")}</p>
        <p className="hint" style={{ margin: 0 }}>{t("exportViewer.cbzModalHint")}</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {TABS.map((tabId) => (
            <button key={tabId} type="button" className={tab === tabId ? "active" : ""} onClick={() => setTab(tabId)}>
              {t(`exportViewer.cbzTab_${tabId}`)}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", maxHeight: "50vh", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
          {tab === "basic" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 2 }}>{textField(metadata, set, "title", t("exportViewer.cbzTitle"), { maxLength: 200 })}</div>
                <div style={{ flex: 1 }}>{textField(metadata, set, "number", t("exportViewer.cbzNumber"), { maxLength: 20 })}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 2 }}>{textField(metadata, set, "series", t("exportViewer.cbzSeries"), { maxLength: 200 })}</div>
                <div style={{ flex: 1 }}>{textField(metadata, set, "volume", t("exportViewer.cbzVolume"), { maxLength: 20 })}</div>
              </div>
              <label>
                {t("exportViewer.cbzSummary")}
                <textarea rows={4} maxLength={4000} value={metadata.summary ?? ""} onChange={(e) => set("summary", e.target.value)} />
              </label>
              <label>
                {t("exportViewer.cbzNotes")}
                <textarea rows={3} maxLength={4000} value={metadata.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
              </label>
            </>
          )}

          {tab === "credits" && (
            <>
              {textField(metadata, set, "writer", t("exportViewer.cbzWriter"), { maxLength: 300 })}
              {textField(metadata, set, "penciller", t("exportViewer.cbzPenciller"), { maxLength: 300 })}
              {textField(metadata, set, "inker", t("exportViewer.cbzInker"), { maxLength: 300 })}
              {textField(metadata, set, "colorist", t("exportViewer.cbzColorist"), { maxLength: 300 })}
              {textField(metadata, set, "letterer", t("exportViewer.cbzLetterer"), { maxLength: 300 })}
              {textField(metadata, set, "coverArtist", t("exportViewer.cbzCoverArtist"), { maxLength: 300 })}
              {textField(metadata, set, "editor", t("exportViewer.cbzEditor"), { maxLength: 300 })}
              {textField(metadata, set, "translator", t("exportViewer.cbzTranslator"), { maxLength: 300 })}
            </>
          )}

          {tab === "publication" && (
            <>
              {textField(metadata, set, "publisher", t("exportViewer.cbzPublisher"), { maxLength: 200 })}
              {textField(metadata, set, "imprint", t("exportViewer.cbzImprint"), { maxLength: 200 })}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>{textField(metadata, set, "year", t("exportViewer.cbzYear"), { maxLength: 4, placeholder: "YYYY" })}</div>
                <div style={{ flex: 1 }}>{textField(metadata, set, "month", t("exportViewer.cbzMonth"), { maxLength: 2, placeholder: "MM" })}</div>
                <div style={{ flex: 1 }}>{textField(metadata, set, "day", t("exportViewer.cbzDay"), { maxLength: 2, placeholder: "DD" })}</div>
              </div>
              {textField(metadata, set, "web", t("exportViewer.cbzWeb"), { maxLength: 500, placeholder: "https://…" })}
              {textField(metadata, set, "languageIso", t("exportViewer.cbzLanguageIso"), { maxLength: 10, placeholder: "de" })}
            </>
          )}

          {tab === "categorization" && (
            <>
              {textField(metadata, set, "genre", t("exportViewer.cbzGenre"), { maxLength: 300, placeholder: "Comedy, Slice of Life" })}
              {textField(metadata, set, "tags", t("exportViewer.cbzTags"), { maxLength: 300 })}
              <label>
                {t("exportViewer.cbzAgeRating")}
                <select value={metadata.ageRating ?? "Unknown"} onChange={(e) => setAgeRating(e.target.value)}>
                  {CBZ_AGE_RATINGS.map((v) => (
                    <option key={v} value={v}>
                      {v === "Unknown" ? t("exportViewer.cbzUnset") : v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("exportViewer.cbzManga")}
                <select value={metadata.manga ?? "Unknown"} onChange={(e) => setManga(e.target.value)}>
                  {CBZ_MANGA_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v === "Unknown" ? t("exportViewer.cbzAuto") : v}
                    </option>
                  ))}
                </select>
              </label>
              {textField(metadata, set, "format", t("exportViewer.cbzFormat"), { maxLength: 100, placeholder: "Digital, Web Comic, TPB…" })}
              {textField(metadata, set, "scanInformation", t("exportViewer.cbzScanInformation"), { maxLength: 300 })}
            </>
          )}

          {tab === "pages" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "4px 6px" }}>{t("exportViewer.cbzPagesImage")}</th>
                  <th style={{ padding: "4px 6px" }}>{t("exportViewer.cbzPagesType")}</th>
                  <th style={{ padding: "4px 6px" }}>{t("exportViewer.cbzPagesDoublePage")}</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page, index) => (
                  <tr key={page} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 6px" }}>{page}</td>
                    <td style={{ padding: "4px 6px" }}>
                      <select value={pageEntries[index]?.type ?? "Story"} onChange={(e) => setPageType(index, e.target.value as CbzPageType)}>
                        {CBZ_PAGE_TYPES.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={pageEntries[index]?.doublePage ?? false}
                        onChange={(e) => setPageDoublePage(index, e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="primary" onClick={handleConfirm} style={{ flex: 1 }}>
            {t("exportViewer.cbzModalConfirm")}
          </button>
          <button onClick={onClose} style={{ flex: 1 }}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
