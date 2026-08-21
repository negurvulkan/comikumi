import type { BubbleShapeKind } from "../../../shared/src/layoutSchema";
import { ImagePicker } from "./ImagePicker";
import { BubbleToolIcon, RectToolIcon, QuadToolIcon, CurvedTextToolIcon, PanelToolIcon, GlobeToolIcon, ContextToolIcon } from "./Icons";

/** What the canvas is currently armed to draw — bubble shapes, or a Panel
 * reference region (see PanelShape.tsx). Not a BubbleShapeKind itself since
 * Panels aren't bubbles. */
export type DrawTool = BubbleShapeKind | "panel";

interface Props {
  drawTool: DrawTool | null;
  onSetDrawTool: (tool: DrawTool | null) => void;
  onInsertImage: (fileName: string, width: number, height: number) => void;
  onAddCurvedText: () => void;
  textPanelOpen: boolean;
  onToggleTextPanel: () => void;
  textPanelDisabled?: boolean;
  contextPanelOpen: boolean;
  onToggleContextPanel: () => void;
}

/** Narrow, always-visible icon strip for the six insert tools plus the text-sidebar
 * toggle — replaces the old inline "+ Rechteck / + Oval / ..." buttons that used to
 * live in the toolbar. */
export function ToolStrip({
  drawTool,
  onSetDrawTool,
  onInsertImage,
  onAddCurvedText,
  textPanelOpen,
  onToggleTextPanel,
  textPanelDisabled,
  contextPanelOpen,
  onToggleContextPanel,
}: Props) {
  return (
    <div className="toolstrip">
      <button
        className={`tool-btn${drawTool === "oval" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "oval" ? null : "oval")}
        title="Blase (oval)"
      >
        <BubbleToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "rect" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "rect" ? null : "rect")}
        title="Rechteck"
      >
        <RectToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "quad" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "quad" ? null : "quad")}
        title="Raute (Perspektive)"
      >
        <QuadToolIcon />
      </button>
      <ImagePicker onInsert={onInsertImage} iconOnly />
      <button className="tool-btn" onClick={onAddCurvedText} title="Kurventext">
        <CurvedTextToolIcon />
      </button>
      <button
        className={`tool-btn${drawTool === "panel" ? " active" : ""}`}
        onClick={() => onSetDrawTool(drawTool === "panel" ? null : "panel")}
        title="Panel (Referenzbereich)"
      >
        <PanelToolIcon />
      </button>
      <span className="toolstrip-sep" />
      <button
        className={`tool-btn${textPanelOpen ? " active" : ""}`}
        onClick={onToggleTextPanel}
        disabled={textPanelDisabled}
        title="Texte dieser Seite"
      >
        <GlobeToolIcon />
      </button>
      <button
        className={`tool-btn${contextPanelOpen ? " active" : ""}`}
        onClick={onToggleContextPanel}
        title="Kontext für Übersetzung"
      >
        <ContextToolIcon />
      </button>
    </div>
  );
}
