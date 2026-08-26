import { useTranslation } from "react-i18next";
import type { BubbleShapeKind, Point } from "../../../shared/src/layoutSchema";
import { ImagePicker } from "./ImagePicker";
import { PanelGridTemplateMenu } from "./PanelGridTemplateMenu";
import {
  BubbleToolIcon,
  RectToolIcon,
  QuadToolIcon,
  CurvedTextToolIcon,
  PanelToolIcon,
  GlobeToolIcon,
  ContextToolIcon,
  ScriptToolIcon,
  BookIcon,
  CommentPinToolIcon,
  CommentBoxToolIcon,
  CommentFreehandToolIcon,
  CommentsPanelToolIcon,
} from "./Icons";

/** What the canvas is currently armed to draw — bubble shapes, a Panel reference
 * region, or one of the three review-comment marker kinds (see
 * shared/src/comments.ts's CommentTargetSchema). Every panel starts as a plain
 * reference marker; its optional Cut-Panel behavior (detach/move/remove/replace
 * content — see PanelShape.tsx/PanelInspector.tsx) is activated afterward from the
 * inspector, not via a separate draw tool, since Panel and Cut-Panel are the same
 * entity. Not a BubbleShapeKind itself since Panels aren't bubbles. */
export type DrawTool = BubbleShapeKind | "panel" | "comment-pin" | "comment-box" | "comment-freehand";

interface Props {
  drawTool: DrawTool | null;
  onSetDrawTool: (tool: DrawTool | null) => void;
  onInsertImage: (fileName: string, width: number, height: number) => void;
  onAddCurvedText: () => void;
  /** Disables every element-creation tool (bubble/rect/quad/image/curved-text/panel) —
   * used for the "translator" project role, which may only edit existing bubble text,
   * not introduce new geometry (see server/src/routes/layout.ts's diff guard, which
   * would reject the save anyway). The sidebar toggles below stay enabled either way —
   * those are read/reference tools, not geometry creation. */
  creationDisabled?: boolean;
  textPanelOpen: boolean;
  onToggleTextPanel: () => void;
  textPanelDisabled?: boolean;
  contextPanelOpen: boolean;
  onToggleContextPanel: () => void;
  scriptPanelOpen: boolean;
  onToggleScriptPanel: () => void;
  storyBiblePanelOpen: boolean;
  onToggleStoryBiblePanel: () => void;
  commentsPanelOpen: boolean;
  onToggleCommentsPanel: () => void;
  imageWidth: number;
  imageHeight: number;
  onCreatePanelGrid: (rects: Point[][]) => void;
}

/** Narrow, always-visible icon strip for the six insert tools plus the text-sidebar
 * toggle — replaces the old inline "+ Rechteck / + Oval / ..." buttons that used to
 * live in the toolbar. */
export function ToolStrip({
  drawTool,
  onSetDrawTool,
  onInsertImage,
  onAddCurvedText,
  creationDisabled,
  textPanelOpen,
  onToggleTextPanel,
  textPanelDisabled,
  contextPanelOpen,
  onToggleContextPanel,
  scriptPanelOpen,
  onToggleScriptPanel,
  storyBiblePanelOpen,
  onToggleStoryBiblePanel,
  commentsPanelOpen,
  onToggleCommentsPanel,
  imageWidth,
  imageHeight,
  onCreatePanelGrid,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="toolstrip">
      <button
        className={`tool-btn${drawTool === "oval" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "oval" ? null : "oval")}
        title={t("editor.toolStrip.bubbleOval")}
        disabled={creationDisabled}
      >
        <BubbleToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "rect" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "rect" ? null : "rect")}
        title={t("editor.toolStrip.rect")}
        disabled={creationDisabled}
      >
        <RectToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "quad" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "quad" ? null : "quad")}
        title={t("editor.toolStrip.quadPerspective")}
        disabled={creationDisabled}
      >
        <QuadToolIcon />
      </button>
      <ImagePicker onInsert={onInsertImage} iconOnly disabled={creationDisabled} />
      <button className="tool-btn" onClick={onAddCurvedText} title={t("editor.textListPanel.typeCurvedText")} disabled={creationDisabled}>
        <CurvedTextToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "panel" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "panel" ? null : "panel")}
        title={t("editor.toolStrip.panelRefRegion")}
        disabled={creationDisabled}
      >
        <PanelToolIcon />
      </button>
      <PanelGridTemplateMenu
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        onCreate={onCreatePanelGrid}
        disabled={creationDisabled}
      />
      <span className="toolstrip-sep" />
      {/* Comment tools are deliberately NOT gated by creationDisabled — that flag is
          specifically about lettering geometry (see its own doc comment above); leaving
          feedback is a different permission axis every project role (down to "viewer")
          is allowed to use, see comments.ts's own doc comment server-side. */}
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
      <button
        className={`tool-btn${textPanelOpen ? " active" : ""}`}
        onClick={onToggleTextPanel}
        disabled={textPanelDisabled}
        title={t("editor.toolStrip.textsThisPage")}
      >
        <GlobeToolIcon />
      </button>
      <button
        className={`tool-btn${contextPanelOpen ? " active" : ""}`}
        onClick={onToggleContextPanel}
        title={t("editor.translatorContextPanel.title")}
      >
        <ContextToolIcon />
      </button>
      <button
        className={`tool-btn${scriptPanelOpen ? " active" : ""}`}
        onClick={onToggleScriptPanel}
        title={t("script.title")}
      >
        <ScriptToolIcon />
      </button>
      <button
        className={`tool-btn${storyBiblePanelOpen ? " active" : ""}`}
        onClick={onToggleStoryBiblePanel}
        title={t("editor.toolStrip.storyBible")}
      >
        <BookIcon />
      </button>
    </div>
  );
}
