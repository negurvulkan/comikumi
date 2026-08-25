import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import type { DrawTool } from "./ToolStrip";
import {
  CommentPinToolIcon,
  CommentBoxToolIcon,
  CommentFreehandToolIcon,
  CommentsPanelToolIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SpreadViewIcon,
  ComparePagesIcon,
} from "./Icons";

/** Only ever the three comment-marker tools in the Reader — no geometry tools exist
 * here at all (see ToolStrip.tsx's full DrawTool union for the editor's superset). */
export type ReaderDrawTool = Extract<DrawTool, "comment-pin" | "comment-box" | "comment-freehand">;

/** "single" = the routed page alone (the original/default Reader view). "spread" =
 * that page auto-paired with its logical neighbor, reading-direction ordered. "compare"
 * = an arbitrary, manually picked set of up to 4 pages (see ReaderComparePicker.tsx) —
 * has no "current page" concept, so page-flip navigation is disabled while active. */
export type ReaderViewMode = "single" | "spread" | "compare";

interface Props {
  drawTool: ReaderDrawTool | null;
  onSetDrawTool: (tool: ReaderDrawTool | null) => void;
  commentsPanelOpen: boolean;
  onToggleCommentsPanel: () => void;
  infoPanelOpen: boolean;
  onToggleInfoPanel: () => void;
  languages: LanguageDef[];
  activeLanguage: string;
  onChangeLanguage: (code: string) => void;
  readingDirection: "ltr" | "rtl";
  onPrevPage: () => void;
  onNextPage: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  viewMode: ReaderViewMode;
  /** Switches directly to "single" or "spread" — "compare" is never set this way, see
   * onOpenComparePicker (there's no such thing as "just" compare mode without first
   * picking which pages). */
  onSetViewMode: (mode: "single" | "spread") => void;
  /** Always opens the picker — both to enter compare mode fresh and to adjust an
   * already-active comparison's page set (Reader.tsx passes the current selection in
   * either case). */
  onOpenComparePicker: () => void;
}

/** Slim toolbar for the read-only QC Reader — the three comment tools ToolStrip.tsx
 * already has (same DrawTool values, so PageCanvas.tsx needs no Reader-specific
 * handling), the comments/info sidebar toggles, a plain language-chip switcher (not
 * the full LanguageStrip, which bundles a language-management form that doesn't
 * belong in a pure reading view), and page-flip controls whose arrow direction follows
 * the project's reading direction — "next" is always the array's next page, only the
 * button's visual side/icon and the keyboard mapping (handled by Reader.tsx) flip. */
export function ReaderToolStrip({
  drawTool,
  onSetDrawTool,
  commentsPanelOpen,
  onToggleCommentsPanel,
  infoPanelOpen,
  onToggleInfoPanel,
  languages,
  activeLanguage,
  onChangeLanguage,
  readingDirection,
  onPrevPage,
  onNextPage,
  canGoPrev,
  canGoNext,
  viewMode,
  onSetViewMode,
  onOpenComparePicker,
}: Props) {
  const { t } = useTranslation();
  const forwardIsLeft = readingDirection === "rtl";
  const ForwardIcon = forwardIsLeft ? ChevronLeftIcon : ChevronRightIcon;
  const BackIcon = forwardIsLeft ? ChevronRightIcon : ChevronLeftIcon;
  const onForward = onNextPage;
  const onBack = onPrevPage;
  // "compare" has no single current page to step from — navigation is meaningless
  // there, not just temporarily unavailable.
  const canForward = viewMode !== "compare" && canGoNext;
  const canBack = viewMode !== "compare" && canGoPrev;

  return (
    <div className="toolstrip">
      <button className="tool-btn" onClick={onBack} disabled={!canBack} title={t("reader.previousPage")}>
        <BackIcon />
      </button>
      <button className="tool-btn" onClick={onForward} disabled={!canForward} title={t("reader.nextPage")}>
        <ForwardIcon />
      </button>
      <span className="toolstrip-sep" />
      <button
        className={`tool-btn${viewMode === "single" ? " active" : ""}`}
        onClick={() => onSetViewMode("single")}
        title={t("reader.viewModeSingle")}
      >
        {t("reader.viewModeSingleShort")}
      </button>
      <button
        className={`tool-btn${viewMode === "spread" ? " active" : ""}`}
        onClick={() => onSetViewMode("spread")}
        title={t("reader.viewModeSpread")}
      >
        <SpreadViewIcon />
      </button>
      <button
        className={`tool-btn${viewMode === "compare" ? " active" : ""}`}
        onClick={onOpenComparePicker}
        title={t("reader.viewModeCompare")}
      >
        <ComparePagesIcon />
      </button>
      <span className="toolstrip-sep" />
      <button
        className={`tool-btn${drawTool === "comment-pin" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "comment-pin" ? null : "comment-pin")}
        title={t("editor.toolStrip.commentPin")}
      >
        <CommentPinToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "comment-box" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "comment-box" ? null : "comment-box")}
        title={t("editor.toolStrip.commentBox")}
      >
        <CommentBoxToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "comment-freehand" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "comment-freehand" ? null : "comment-freehand")}
        title={t("editor.toolStrip.commentFreehand")}
      >
        <CommentFreehandToolIcon />
      </button>
      <button
        className={`tool-btn${commentsPanelOpen ? " active" : ""}`}
        onClick={onToggleCommentsPanel}
        title={t("editor.commentsPanel.title")}
      >
        <CommentsPanelToolIcon />
      </button>
      <span className="toolstrip-sep" />
      <button className={`tool-btn${infoPanelOpen ? " active" : ""}`} onClick={onToggleInfoPanel} title={t("reader.infoPanelTitle")}>
        {t("reader.infoPanelShort")}
      </button>
      {languages.length > 1 && (
        <div className="langstrip-horizontal" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", padding: "4px 0" }}>
          {languages.map((l) => (
            <button
              key={l.code}
              className={`lang-chip${l.code === activeLanguage ? " active" : ""}`}
              onClick={() => onChangeLanguage(l.code)}
              title={l.label}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
