import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PageLayout } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { Comment, CommentTarget } from "../../../shared/src/comments";
import { api } from "../api/client";
import { PageCanvas } from "./PageCanvas";
import { ReaderPanelStrip } from "./ReaderPanelStrip";
import type { ReaderDrawTool } from "./ReaderToolStrip";
import type { ReadingDirection } from "./reportUtils";

interface Props {
  volumeId: string;
  page: string;
  /** null = still loading — shows a loading placeholder instead of the canvas, so a
   * slow-to-fetch comparison/spread page never blocks the whole Reader screen (only
   * Reader.tsx's own primary/routed page blocks at that level — see its own doc
   * comment). */
  layout: PageLayout | null;
  characters: Character[];
  presets: LetteringPreset[];
  activeLanguage: string;
  fontsVersion: number;
  drawTool: ReaderDrawTool | null;
  readingDirection: ReadingDirection;
  /** Already filtered to this cell's own page — see Reader.tsx. */
  comments: Comment[];
  selectedCommentId: string | null;
  onRequestCreateComment: (page: string, target: CommentTarget, clientX: number, clientY: number) => void;
  onSelectComment: (commentId: string, clientX: number, clientY: number) => void;
}

/** One page's worth of the Reader — a PageCanvas plus its panel-jump strip, with its
 * OWN local selection/zoom-target state. Extracted out of Reader.tsx so multiple pages
 * can be shown at once (spread/compare view): each needs an independent selection and
 * an independent zoom-to-panel target, unlike the single-page case where Reader.tsx
 * used to own that state directly. */
export function ReaderPageCell({
  volumeId,
  page,
  layout,
  characters,
  presets,
  activeLanguage,
  fontsVersion,
  drawTool,
  readingDirection,
  comments,
  selectedCommentId,
  onRequestCreateComment,
  onSelectComment,
}: Props) {
  const { t } = useTranslation();
  const [focusRequest, setFocusRequest] = useState<{ panelId: string; requestId: number } | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedCurvedTextId, setSelectedCurvedTextId] = useState<string | null>(null);

  if (!layout) {
    return (
      <div className="reader-page-cell reader-page-cell-loading">
        <p className="hint">{t("editor.editorRoute.loadingPage")}</p>
      </div>
    );
  }

  return (
    <div className="reader-page-cell">
      <PageCanvas
        // Keyed on `page` so PageCanvas's own internal zoom/pan state resets whenever
        // THIS cell is asked to show a different page (spread/compare selection
        // changes) instead of carrying over a leftover zoomed-in rectangle.
        key={page}
        volumeId={volumeId}
        page={page}
        imageUrl={api.pageImageUrl(volumeId, page)}
        imageWidth={layout.imageWidth}
        imageHeight={layout.imageHeight}
        bubbles={layout.bubbles}
        images={layout.images}
        curvedTexts={layout.curvedTexts}
        panels={layout.panels}
        characters={characters}
        presets={presets}
        selectedIds={selectedBubbleId ? [selectedBubbleId] : []}
        selectedImageIds={selectedImageId ? [selectedImageId] : []}
        selectedCurvedTextIds={selectedCurvedTextId ? [selectedCurvedTextId] : []}
        selectedPanelIds={selectedPanelId ? [selectedPanelId] : []}
        activeLanguage={activeLanguage}
        fontsVersion={fontsVersion}
        drawTool={drawTool}
        readOnly
        onSelect={setSelectedBubbleId}
        onChange={() => {}}
        onCreate={() => {}}
        onSelectImage={setSelectedImageId}
        onChangeImage={() => {}}
        onSelectCurvedText={setSelectedCurvedTextId}
        onChangeCurvedText={() => {}}
        onSelectPanel={setSelectedPanelId}
        onChangePanel={() => {}}
        onCreatePanel={() => {}}
        onReassignPanel={() => {}}
        onDeselectAll={() => {
          setSelectedBubbleId(null);
          setSelectedPanelId(null);
          setSelectedImageId(null);
          setSelectedCurvedTextId(null);
        }}
        onDuplicateSelected={() => {}}
        onDeleteSelected={() => {}}
        comments={comments}
        selectedCommentId={selectedCommentId}
        onRequestCreateComment={(target, clientX, clientY) => onRequestCreateComment(page, target, clientX, clientY)}
        onSelectComment={onSelectComment}
        focusRequest={focusRequest}
      />
      <ReaderPanelStrip
        imageUrl={api.pageImageUrl(volumeId, page)}
        panels={layout.panels}
        bubbles={layout.bubbles}
        activeLanguage={activeLanguage}
        readingDirection={readingDirection}
        selectedPanelId={selectedPanelId}
        onFocusPanel={(panelId) => {
          setSelectedPanelId(panelId);
          setFocusRequest((prev) => ({ panelId, requestId: (prev?.requestId ?? 0) + 1 }));
        }}
      />
    </div>
  );
}
