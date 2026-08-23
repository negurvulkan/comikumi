import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Stage, Layer, Image as KonvaImage, Rect, Ellipse, Group } from "react-konva";
import Konva from "konva";
import type { Bubble, BubbleShapeKind, CurvedTextElement, ImageElement, Panel, Point } from "../../../shared/src/layoutSchema";
import { boxCorners, panelDisplayLabel } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { LetteringPreset } from "../../../shared/src/presets";
import { useHtmlImage } from "./useHtmlImage";
import { BubbleShape } from "./BubbleShape";
import { ImageElementShape } from "./ImageElementShape";
import { CurvedTextElementShape } from "./CurvedTextElementShape";
import { PanelShape } from "./PanelShape";
import { CutPanelContentShape } from "./CutPanelContentShape";
import { sampleAverageColor } from "./holeFillColor";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import type { DrawTool } from "./ToolStrip";

// Konva 9 only fires pointer* events by default (no legacy mouse* aliases),
// but this whole editor is built on onMouseDown/onClick/onDragEnd etc. Force
// classic mouse/touch event handling so those handlers actually run.
// `pointerEventsEnabled` is real at runtime (konva/lib/Global.js) but missing
// from this version's public .d.ts, hence the narrow cast instead of `any`.
(Konva as typeof Konva & { pointerEventsEnabled: boolean }).pointerEventsEnabled = false;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.15;

interface Props {
  /** Purely cosmetic — shown as the leading path segment in the titlebar, e.g.
   * "Keito no Sei" so the path reads "/Keito no Sei/Volume_01/volume_01/page_01". */
  projectName?: string;
  volumeId: string;
  page: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  bubbles: Bubble[];
  images: ImageElement[];
  curvedTexts: CurvedTextElement[];
  panels: Panel[];
  characters: Character[];
  presets: LetteringPreset[];
  selectedIds: string[];
  selectedImageIds: string[];
  selectedCurvedTextIds: string[];
  selectedPanelIds: string[];
  activeLanguage: string;
  fontsVersion: number;
  drawTool: DrawTool | null;
  /** Disables drag/resize/rotate/reshape handles on every existing element (but not
   * selection) — see BubbleShape.tsx's Props doc comment for the "translator" role
   * this exists for. */
  readOnly?: boolean;
  onSelect: (id: string | null, additive?: boolean) => void;
  onChange: (id: string, patch: Partial<Bubble>) => void;
  onCreate: (shape: BubbleShapeKind, box: { x: number; y: number; width: number; height: number }) => void;
  onSelectImage: (id: string | null, additive?: boolean) => void;
  onChangeImage: (id: string, patch: Partial<ImageElement>) => void;
  onSelectCurvedText: (id: string | null, additive?: boolean) => void;
  onChangeCurvedText: (id: string, patch: Partial<CurvedTextElement>) => void;
  onSelectPanel: (id: string | null, additive?: boolean) => void;
  onChangePanel: (id: string, patch: Partial<Panel>) => void;
  onCreatePanel: (points: Point[]) => void;
  /** Same rectangle-drag gesture as onCreatePanel, but marks the new panel as a
   * Cut-Panel — `holeFillColor` is the auto-sampled fill color for its vacated original
   * spot (see holeFillColor.ts), computed here since this component already has the
   * loaded source image. */
  onCreateCutPanel: (points: Point[], holeFillColor: string) => void;
  /** Manual (re)assignment/detachment from the right-click "Panel zuweisen" submenu —
   * goes through editorStore's reassignBubblePanel so the bubble's coordinates convert
   * between absolute and panel-relative correctly (never a raw panelId patch). */
  onReassignPanel: (bubbleId: string, panelId: string | null) => void;
  onDeselectAll: () => void;
  /** Right-click actions on the currently (single-)selected element — the context menu
   * selects that element first, so these mirror the generic keyboard shortcuts (Ctrl+D /
   * Delete) but scoped to exactly the one element that was right-clicked. */
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
}

export function PageCanvas({
  projectName,
  volumeId,
  page,
  imageUrl,
  imageWidth,
  imageHeight,
  bubbles,
  images,
  curvedTexts,
  panels,
  characters,
  presets,
  selectedIds,
  selectedImageIds,
  selectedCurvedTextIds,
  selectedPanelIds,
  activeLanguage,
  fontsVersion,
  drawTool,
  readOnly,
  onSelect,
  onChange,
  onCreate,
  onSelectImage,
  onChangeImage,
  onSelectCurvedText,
  onChangeCurvedText,
  onSelectPanel,
  onChangePanel,
  onCreatePanel,
  onCreateCutPanel,
  onReassignPanel,
  onDeselectAll,
  onDuplicateSelected,
  onDeleteSelected,
}: Props) {
  const { t } = useTranslation();
  const image = useHtmlImage(imageUrl);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: "bubble" | "panel"; id: string } | null>(null);
  const [vertexMenu, setVertexMenu] = useState<{ x: number; y: number; panelId: string; vertexIndex: number } | null>(null);

  // The Stage is sized to whatever room the surrounding layout actually gives
  // it (tracked via ResizeObserver), not a fixed pixel width — so tall pages
  // shrink to fit the viewport height instead of pushing the page into a
  // vertical scrollbar, and wide windows show the page larger.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 780, height: 560 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setViewportSize({ width: box.width, height: box.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale =
    imageWidth > 0 && imageHeight > 0
      ? Math.min(1, viewportSize.width / imageWidth, viewportSize.height / imageHeight)
      : 1;
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  const layerRef = useRef<Konva.Layer>(null);
  const [zoom, setZoom] = useState(1);
  // Pan is stored as an offset from "image centered in the viewport at the
  // current zoom", not an absolute stage position — so the page stays
  // centered (and the Stage itself always fills the whole canvas area,
  // instead of being clipped to the un-zoomed fit size) as the viewport or
  // zoom level changes, until the user explicitly drags it elsewhere.
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  function centerFor(z: number) {
    return { x: (viewportSize.width - displayWidth * z) / 2, y: (viewportSize.height - displayHeight * z) / 2 };
  }
  const center = centerFor(zoom);
  const stageX = center.x + panOffset.x;
  const stageY = center.y + panOffset.y;

  const [draft, setDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Refs (not state) drive the actual box math so mouseup always sees the true
  // start/current pointer positions, independent of whether React has flushed
  // the `draft` preview state in between fast-firing mouse events.
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const currentPos = useRef<{ x: number; y: number } | null>(null);
  const activeDrawTool = useRef<DrawTool | null>(null);

  function boxFromRefs() {
    if (!startPos.current || !currentPos.current) return null;
    const x = Math.min(startPos.current.x, currentPos.current.x);
    const y = Math.min(startPos.current.y, currentPos.current.y);
    const width = Math.abs(currentPos.current.x - startPos.current.x);
    const height = Math.abs(currentPos.current.y - startPos.current.y);
    return { x, y, width, height };
  }

  // Position in the layer's own (unzoomed/unpanned) coordinate space, so drawing
  // math stays correct no matter the current zoom/pan.
  function relativePointer() {
    return layerRef.current?.getRelativePointerPosition() ?? null;
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!drawTool) {
      // Clicking a bubble itself, or one of the Transformer's resize/rotate
      // handles (a sibling node, not a child of the bubble group), must not
      // count as "empty space" — only deselect for genuine background clicks.
      const hitInteractive =
        e.target !== e.target.getStage() &&
        (e.target.findAncestor(".bubble", true) || e.target.findAncestor("Transformer", true));
      if (!hitInteractive) onDeselectAll();
      return;
    }
    const pos = relativePointer();
    if (!pos) return;
    activeDrawTool.current = drawTool;
    startPos.current = pos;
    currentPos.current = pos;
    setDraft({ x: pos.x, y: pos.y, width: 0, height: 0 });
  }

  function handleMouseMove() {
    if (!startPos.current) return;
    const pos = relativePointer();
    if (!pos) return;
    currentPos.current = pos;
    setDraft(boxFromRefs());
  }

  function handleMouseUp() {
    const tool = activeDrawTool.current;
    const box = boxFromRefs();
    startPos.current = null;
    currentPos.current = null;
    activeDrawTool.current = null;
    setDraft(null);
    if (!tool || !box) return;
    if (box.width > 5 && box.height > 5) {
      const scaledBox = { x: box.x / scale, y: box.y / scale, width: box.width / scale, height: box.height / scale };
      if (tool === "panel") {
        onCreatePanel(boxCorners(scaledBox.x, scaledBox.y, scaledBox.width, scaledBox.height));
      } else if (tool === "cut-panel") {
        const bounds = {
          minX: scaledBox.x,
          minY: scaledBox.y,
          maxX: scaledBox.x + scaledBox.width,
          maxY: scaledBox.y + scaledBox.height,
        };
        const holeFillColor = image ? sampleAverageColor(image, bounds) : "#ffffff";
        onCreateCutPanel(boxCorners(scaledBox.x, scaledBox.y, scaledBox.width, scaledBox.height), holeFillColor);
      } else {
        onCreate(tool, scaledBox);
      }
    }
  }

  function zoomAt(pointer: { x: number; y: number }, newZoom: number) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    // Keep the point under the pointer/anchor fixed on screen while the
    // zoom level changes, same math as before — just expressed via the
    // center-relative stage position instead of an absolute one.
    const mousePointTo = { x: (pointer.x - stageX) / zoom, y: (pointer.y - stageY) / zoom };
    const newStageX = pointer.x - mousePointTo.x * clamped;
    const newStageY = pointer.y - mousePointTo.y * clamped;
    const newCenter = centerFor(clamped);
    setZoom(clamped);
    setPanOffset({ x: newStageX - newCenter.x, y: newStageY - newCenter.y });
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    zoomAt(pointer, direction > 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP);
  }

  function handleStageDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    if (e.target !== e.target.getStage()) return;
    setPanOffset({ x: e.target.x() - center.x, y: e.target.y() - center.y });
  }

  function zoomButton(factor: number) {
    zoomAt({ x: viewportSize.width / 2, y: viewportSize.height / 2 }, zoom * factor);
  }

  function resetView() {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }

  /** Right-click menu content for the currently targeted bubble/panel — built fresh
   * on each open from the live layout so panel/character lists are always current. */
  function contextMenuEntries(): ContextMenuEntry[] {
    if (!contextMenu) return [];
    if (contextMenu.kind === "bubble") {
      const bubble = bubbles.find((b) => b.id === contextMenu.id);
      if (!bubble) return [];
      return [
        {
          type: "submenu",
          label: t("editor.contextMenu.assignPanel"),
          options: [
            {
              label: t("editor.contextMenu.noPanel"),
              selected: !bubble.panelId,
              onClick: () => onReassignPanel(bubble.id, null),
            },
            ...panels.map((p, i) => ({
              label: panelDisplayLabel(p, i),
              selected: bubble.panelId === p.id,
              onClick: () => onReassignPanel(bubble.id, p.id),
            })),
          ],
        },
        {
          type: "submenu",
          label: t("editor.contextMenu.assignCharacter"),
          options: [
            { label: t("editor.contextMenu.noCharacter"), selected: !bubble.characterId, onClick: () => onChange(bubble.id, { characterId: null }) },
            ...characters.map((c) => ({
              label: c.name,
              selected: bubble.characterId === c.id,
              onClick: () => onChange(bubble.id, { characterId: c.id }),
            })),
          ],
        },
        {
          type: "submenu",
          label: t("editor.contextMenu.assignPreset"),
          options: [
            { label: t("editor.contextMenu.noPreset"), selected: !bubble.presetId, onClick: () => onChange(bubble.id, { presetId: null }) },
            ...presets.map((p) => ({
              label: p.name,
              selected: bubble.presetId === p.id,
              onClick: () => onChange(bubble.id, { presetId: p.id }),
            })),
          ],
        },
        { type: "separator" },
        { type: "action", label: t("editor.contextMenu.duplicate"), onClick: onDuplicateSelected, disabled: bubble.locked },
        { type: "action", label: t("common.delete"), danger: true, onClick: onDeleteSelected, disabled: bubble.locked },
      ];
    }
    const panel = panels.find((p) => p.id === contextMenu.id);
    return [
      { type: "action", label: t("editor.contextMenu.duplicate"), onClick: onDuplicateSelected, disabled: panel?.locked },
      { type: "action", label: t("common.delete"), danger: true, onClick: onDeleteSelected, disabled: panel?.locked },
    ];
  }

  /** Right-click menu for a single polygon vertex — kept separate from
   * contextMenuEntries() since it needs the panel's own current point count
   * (to disable removal at the 3-point floor) rather than the layout at large. */
  function vertexMenuEntries(): ContextMenuEntry[] {
    if (!vertexMenu) return [];
    const panel = panels.find((p) => p.id === vertexMenu.panelId);
    if (!panel) return [];
    return [
      {
        type: "action",
        label: t("editor.contextMenu.removePoint"),
        disabled: panel.points.length <= 3,
        onClick: () => onChangePanel(panel.id, { points: panel.points.filter((_, i) => i !== vertexMenu.vertexIndex) }),
      },
    ];
  }

  return (
    <div className="canvas-panel">
      <div className="canvas-titlebar">
        <span className="canvas-titlebar-name">{page}</span>
        <Link
          to={`/volumes/${encodeURIComponent(volumeId)}`}
          className="canvas-titlebar-path canvas-titlebar-link"
          title={t("editor.breadcrumbBackToPages")}
        >
          /{projectName ? `${projectName}/${volumeId}` : volumeId}
        </Link>
        <span className="canvas-titlebar-path">/{page}</span>
      </div>
      <div className="canvas-viewport" ref={viewportRef}>
        <Stage
          width={Math.max(1, viewportSize.width)}
          height={Math.max(1, viewportSize.height)}
          scaleX={zoom}
          scaleY={zoom}
          x={stageX}
          y={stageY}
          draggable={!drawTool}
          onWheel={handleWheel}
          onDragEnd={handleStageDragEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: drawTool ? "crosshair" : "default" }}
        >
        <Layer ref={layerRef}>
          {image && <KonvaImage image={image} width={displayWidth} height={displayHeight} />}
          {image &&
            panels
              .filter((p) => p.cut)
              .map((panel) => (
                <CutPanelContentShape
                  key={`cut-${panel.id}`}
                  panel={panel}
                  image={image}
                  scale={scale}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                />
              ))}
          {panels.map((panel, index) => (
            <PanelShape
              key={panel.id}
              panel={panel}
              index={index}
              scale={scale}
              zoom={zoom}
              selected={selectedPanelIds.includes(panel.id)}
              onSelect={(additive) => onSelectPanel(panel.id, additive)}
              onChange={(patch) => onChangePanel(panel.id, patch)}
              onContextMenu={(clientX, clientY) => setContextMenu({ x: clientX, y: clientY, kind: "panel", id: panel.id })}
              onVertexContextMenu={(clientX, clientY, vertexIndex) =>
                setVertexMenu({ x: clientX, y: clientY, panelId: panel.id, vertexIndex })
              }
              readOnly={readOnly}
            />
          ))}
          {images.map((img) => (
            <ImageElementShape
              key={img.id}
              element={img}
              activeLanguage={activeLanguage}
              scale={scale}
              zoom={zoom}
              selected={selectedImageIds.includes(img.id)}
              onSelect={(additive) => onSelectImage(img.id, additive)}
              onChange={(patch) => onChangeImage(img.id, patch)}
              readOnly={readOnly}
            />
          ))}
          {bubbles
            .filter((b) => !b.panelId || !panels.some((p) => p.id === b.panelId))
            .map((b) => (
              <BubbleShape
                key={`${b.id}-${fontsVersion}`}
                bubble={b}
                scale={scale}
                zoom={zoom}
                activeLanguage={activeLanguage}
                presets={presets}
                selected={selectedIds.includes(b.id)}
                onSelect={(additive) => onSelect(b.id, additive)}
                onChange={(patch) => onChange(b.id, patch)}
                onContextMenu={(clientX, clientY) => setContextMenu({ x: clientX, y: clientY, kind: "bubble", id: b.id })}
                readOnly={readOnly}
              />
            ))}
          {panels.map((panel) => {
            const children = bubbles.filter((b) => b.panelId === panel.id);
            if (children.length === 0) return null;
            // Nested inside a Group anchored at the panel's origin — a child bubble's own
            // x/y are relative to this origin, and Konva composes the parent transform
            // automatically, so BubbleShape's drag/transform handlers need no changes at
            // all: e.target.x()/y() already comes back panel-relative for free.
            return (
              <Group key={`panel-children-${panel.id}`} x={panel.origin.x * scale} y={panel.origin.y * scale}>
                {children.map((b) => (
                  <BubbleShape
                    key={`${b.id}-${fontsVersion}`}
                    bubble={b}
                    scale={scale}
                    zoom={zoom}
                    activeLanguage={activeLanguage}
                    presets={presets}
                    selected={selectedIds.includes(b.id)}
                    onSelect={(additive) => onSelect(b.id, additive)}
                    onChange={(patch) => onChange(b.id, patch)}
                    onContextMenu={(clientX, clientY) => setContextMenu({ x: clientX, y: clientY, kind: "bubble", id: b.id })}
                    readOnly={readOnly}
                  />
                ))}
              </Group>
            );
          })}
          {curvedTexts.map((el) => (
            <CurvedTextElementShape
              key={`${el.id}-${fontsVersion}`}
              element={el}
              activeLanguage={activeLanguage}
              scale={scale}
              zoom={zoom}
              presets={presets}
              selected={selectedCurvedTextIds.includes(el.id)}
              onSelect={(additive) => onSelectCurvedText(el.id, additive)}
              onChange={(patch) => onChangeCurvedText(el.id, patch)}
              readOnly={readOnly}
            />
          ))}
          {draft &&
            (drawTool === "oval" ? (
              <Ellipse
                x={draft.x + draft.width / 2}
                y={draft.y + draft.height / 2}
                radiusX={draft.width / 2}
                radiusY={draft.height / 2}
                stroke="#6c8cff"
                dash={[4, 4]}
              />
            ) : (
              <Rect x={draft.x} y={draft.y} width={draft.width} height={draft.height} stroke="#6c8cff" dash={[4, 4]} />
            ))}
        </Layer>
        </Stage>
      </div>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} entries={contextMenuEntries()} onClose={() => setContextMenu(null)} />
      )}
      {vertexMenu && (
        <ContextMenu x={vertexMenu.x} y={vertexMenu.y} entries={vertexMenuEntries()} onClose={() => setVertexMenu(null)} />
      )}
      <div className="canvas-statusbar">
        <button onClick={() => zoomButton(1 / ZOOM_STEP)} title={t("editor.canvas.zoomOut")}>
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomButton(ZOOM_STEP)} title={t("editor.canvas.zoomIn")}>
          +
        </button>
        <button onClick={resetView} title={t("editor.canvas.resetView")}>
          Reset
        </button>
        <span className="hint">{t("editor.canvas.scrollPanHint")}</span>
      </div>
    </div>
  );
}
