import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import type { ResolvedChapter } from "../../../shared/src/pageMeta";
import { LoadingIndicator } from "./LoadingIndicator";

interface Props {
  languages: LanguageDef[];
  chapters: ResolvedChapter[];
  publishing: boolean;
  publishMsg: string | null;
  onPublish: (input: {
    pages: string[];
    languageCode: string;
    seriesTitle: string;
    sourceLanguage: string;
    synopsis?: string;
    chapterNumber: number;
    chapterTitle: string;
    published: boolean;
    accessMode: "free" | "supporter_only";
    includeCover: boolean;
  }) => void;
  onClose: () => void;
}

/**
 * "Publish to AI MANGA" — deliberately much smaller than ExportPanel.tsx: a connector
 * publish is always exactly one chapter (= one ComiKumi chapter grouping, see
 * shared/src/pageMeta.ts's ResolvedChapter) at a time, matching AI MANGA's
 * `scope: "chapter"` manifest contract (see the connector-subsystem plan), so there's no
 * page-range/mode picker like the general export flow has.
 */
export function PublishPanel({ languages, chapters, publishing, publishMsg, onPublish, onClose }: Props) {
  const { t } = useTranslation();
  const [chapterId, setChapterId] = useState(chapters[0]?.chapter.id ?? "");
  const [languageCode, setLanguageCode] = useState(languages[0]?.code ?? "");
  const [seriesTitle, setSeriesTitle] = useState("");
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapterTitle, setChapterTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [published, setPublished] = useState(false);
  const [accessMode, setAccessMode] = useState<"free" | "supporter_only">("free");
  const [includeCover, setIncludeCover] = useState(true);

  const selectedChapter = chapters.find((c) => c.chapter.id === chapterId);
  const canSubmit = !publishing && !!selectedChapter && selectedChapter.pageIds.length > 0 && !!languageCode && seriesTitle.trim().length > 0 && chapterTitle.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || !selectedChapter) return;
    onPublish({
      pages: selectedChapter.pageIds,
      languageCode,
      seriesTitle: seriesTitle.trim(),
      sourceLanguage: languageCode,
      synopsis: synopsis.trim() || undefined,
      chapterNumber,
      chapterTitle: chapterTitle.trim(),
      published,
      accessMode,
      includeCover,
    });
  }

  return (
    <div className="inspector" style={{ maxWidth: 360 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        {t("publishPanel.title")} <span className="hint">{t("account.connectors.experimental")}</span>
      </p>

      {chapters.length === 0 ? (
        <p className="hint">{t("publishPanel.noChapters")}</p>
      ) : (
        <label>
          {t("exportPanel.chapterLabel")}
          <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            {chapters.map(({ chapter, pageIds }) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.name} ({pageIds.length})
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        {t("exportPanel.languageLabel")}
        <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t("publishPanel.seriesTitleLabel")}
        <input type="text" value={seriesTitle} onChange={(e) => setSeriesTitle(e.target.value)} />
      </label>

      <label>
        {t("publishPanel.synopsisLabel")}
        <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={2} />
      </label>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ flex: 1 }}>
          {t("publishPanel.chapterNumberLabel")}
          <input type="number" min={1} value={chapterNumber} onChange={(e) => setChapterNumber(Number(e.target.value))} />
        </label>
        <label style={{ flex: 2 }}>
          {t("publishPanel.chapterTitleLabel")}
          <input type="text" value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} />
        </label>
      </div>

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} />
        {t("publishPanel.includeCover")}
      </label>

      <label>{t("publishPanel.visibilityLabel")}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button className={!published ? "active" : ""} onClick={() => setPublished(false)}>
          {t("publishPanel.draft")}
        </button>
        <button className={published ? "active" : ""} onClick={() => setPublished(true)}>
          {t("publishPanel.publishImmediately")}
        </button>
      </div>
      {published && (
        <label>
          {t("publishPanel.accessModeLabel")}
          <select value={accessMode} onChange={(e) => setAccessMode(e.target.value as "free" | "supporter_only")}>
            <option value="free">{t("publishPanel.accessModeFree")}</option>
            <option value="supporter_only">{t("publishPanel.accessModeSupporterOnly")}</option>
          </select>
        </label>
      )}

      {publishMsg && (
        <p style={{ margin: "4px 0 0", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          {publishing && <LoadingIndicator size="sm" />}
          {publishMsg}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {publishing ? t("publishPanel.publishing") : t("publishPanel.publishButton")}
        </button>
        <button onClick={onClose} disabled={publishing}>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
