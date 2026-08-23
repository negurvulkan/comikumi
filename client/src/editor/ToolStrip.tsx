import { useTranslation } from "react-i18next";
import type { BubbleShapeKind } from "../../../shared/src/layoutSchema";
import { ImagePicker } from "./ImagePicker";
import {
  BubbleToolIcon,
  RectToolIcon,
  QuadToolIcon,
  CurvedTextToolIcon,
  PanelToolIcon,
  GlobeToolIcon,
  ContextToolIcon,
  ScriptToolIcon,
} from "./Icons";

/** What the canvas is currently armed to draw — bubble shapes, or a Panel reference
 * region. Every panel starts as a plain reference marker; its optional Cut-Panel
 * behavior (detach/move/remove/replace content — see PanelShape.tsx/PanelInspector.tsx)
 * is activated afterward from the inspector, not via a separate draw tool, since Panel
 * and Cut-Panel are the same entity. Not a BubbleShapeKind itself since Panels aren't
 * bubbles. */
export type DrawTool = BubbleShapeKind | "panel";

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
    </div>
  );
}
