import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Stage, Layer, Image as KonvaImage, Rect, Ellipse, Group, Line } from "react-konva";
import Konva from "konva";
import type { Bubble, BubbleShapeKind, CurvedTextElement, ImageElement, Panel, Point } from "../../../shared/src/layoutSchema";
import { boxCorners, panelDisplayLabel, polygonBounds, resolvePanelForLanguage } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { Comment, CommentTarget } from "../../../shared/src/comments";
import { useHtmlImage } from "./useHtmlImage";
import { BubbleShape } from "./BubbleShape";
import { ImageElementShape } from "./ImageElementShape";
import { CurvedTextElementShape } from "./CurvedTextElementShape";
import { PanelShape } from "./PanelShape";
import { CutPanelContentShape } from "./CutPanelContentShape";
import { CommentMarkerShape } from "./CommentMarkerShape";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { setVertexAngle } from "./geometry";
import type { DrawTool } from "./ToolStrip";

/** Color/width new freehand comment strokes are created with — a comment's markup
 * isn't user-customizable per-stroke (unlike Cut-Panel replacement borders), so one
 * fixed, clearly-a-QC-annotation red is enough. */
const FREEHAND_COMMENT_COLOR = "#ff5a5a";
const FREEHAND_COMMENT_WIDTH_PX = 4;

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
  /** This page's review comments only (Editor.tsx already filters the volume-wide list —
   * see CommentsPanel.tsx, which shows the unfiltered volume list instead). */
  comments: Comment[];
  selectedCommentId: string | null;
  /** Fired once a comment-pin/box/freehand tool finishes placing a target — Editor.tsx
   * owns the actual CommentThread popover (position: fixed, so it doesn't need to be a
   * DOM child of the canvas) and opens it in "create" mode at (clientX, clientY). */
  onRequestCreateComment: (target: CommentTarget, clientX: number, clientY: number) => void;
  /** Fired when an existing marker (CommentMarkerShape) is clicked — opens/selects its
   * thread the same way, at the click's screen position. */
  onSelectComment: (commentId: string, clientX: number, clientY: number) => void;
  /** Programmatic "zoom to fit this panel" request — used by Reader.tsx's panel strip
   * (ReaderPanelStrip.tsx) to jump straight to a specific panel instead of the usual
   * scroll/manual-zoom. `requestId` must change (a simple incrementing counter is
   * enough) for a repeat click on the SAME panel to reliably re-trigger the effect —
   * object identity alone doesn't help if a caller happens to reuse the same object. */
  focusRequest?: { panelId: string; requestId: number } | null;
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
  onReassignPanel,
  onDeselectAll,
  onDuplicateSelected,
  onDeleteSelected,
  comments,
  selectedCommentId,
  onRequestCreateComment,
  onSelectComment,
  focusRequest,
}: Props) {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const image = useHtmlImage(imageUrl);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: "bubble" | "panel"; id: string } | null>(null);
  const [vertexMenu, setVertexMenu] = useState<{ x: number; y: number; kind: "panel" | "bubble"; targetId: string; vertexIndex: number } | null>(
    null
  );

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
  // The "comment-freehand" tool needs every point along the drag (a full stroke path),
  // not just a start/current bounding box like every other draw tool — collected the
  // same ref-not-state way as startPos/currentPos above, for the same reason.
  const freehandPoints = useRef<{ x: number; y: number }[]>([]);
  const [freehandDraft, setFreehandDraft] = useState<{ x: number; y: number }[] | null>(null);

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
    if (drawTool === "comment-freehand") {
      freehandPoints.current = [pos];
      setFreehandDraft(freehandPoints.current);
    }
  }

  function handleMouseMove() {
    if (!startPos.current) return;
    const pos = relativePointer();
    if (!pos) return;
    currentPos.current = pos;
    setDraft(boxFromRefs());
    if (activeDrawTool.current === "comment-freehand") {
      freehandPoints.current = [...freehandPoints.current, pos];
      setFreehandDraft(freehandPoints.current);
    }
  }

  function handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    const tool = activeDrawTool.current;
    const box = boxFromRefs();
    const strokePoints = freehandPoints.current;
    startPos.current = null;
    currentPos.current = null;
    activeDrawTool.current = null;
    freehandPoints.current = [];
    setDraft(null);
    setFreehandDraft(null);
    if (!tool) return;

    // The three comment tools each finish placement by opening the "create" popover
    // (Editor.tsx owns it) instead of creating the layout element directly — a
    // comment needs body text (and optionally mentions) before it's worth persisting.
    if (tool === "comment-pin") {
      if (!box) return;
      onRequestCreateComment({ kind: "pin", point: { x: box.x / scale, y: box.y / scale } }, e.evt.clientX, e.evt.clientY);
      return;
    }
    if (tool === "comment-box") {
      if (!box || box.width <= 5 || box.height <= 5) return;
      const scaledBox = { x: box.x / scale, y: box.y / scale, width: box.width / scale, height: box.height / scale };
      onRequestCreateComment(
        { kind: "box", points: boxCorners(scaledBox.x, scaledBox.y, scaledBox.width, scaledBox.height) },
        e.evt.clientX,
        e.evt.clientY
      );
      return;
    }
    if (tool === "comment-freehand") {
      if (strokePoints.length < 2) return;
      const stroke = strokePoints.map((p) => ({ x: p.x / scale, y: p.y / scale }));
      onRequestCreateComment(
        { kind: "freehand", strokes: [stroke], color: FREEHAND_COMMENT_COLOR, strokeWidthPx: FREEHAND_COMMENT_WIDTH_PX },
        e.evt.clientX,
        e.evt.clientY
      );
      return;
    }

    if (!box) return;
    if (box.width > 5 && box.height > 5) {
      const scaledBox = { x: box.x / scale, y: box.y / scale, width: box.width / scale, height: box.height / scale };
      if (tool === "panel") {
        onCreatePanel(boxCorners(scaledBox.x, scaledBox.y, scaledBox.width, scaledBox.height));
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

  // Same padding/fit idea as PanelCropPreview.tsx's baseScale, generalized from a fixed
  // square `size` to this Stage's actual (possibly non-square, resizable) viewport.
  const FOCUS_PANEL_PADDING = 0.85;

  /** Zooms/pans so `panel`'s bounding box fills most of the viewport, centered —
   * see Reader.tsx's panel strip. Reuses the same zoom/pan state zoomAt() already
   * drives, just anchored on an image-space box center instead of a screen pointer. */
  function focusOnPanel(panel: Panel) {
    const bounds = polygonBounds(resolvePanelForLanguage(panel, activeLanguage).points);
    const boxWidth = Math.max(1, bounds.maxX - bounds.minX) * scale;
    const boxHeight = Math.max(1, bounds.maxY - bounds.minY) * scale;
    const fitZoom = FOCUS_PANEL_PADDING * Math.min(viewportSize.width / boxWidth, viewportSize.height / boxHeight);
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitZoom));

    const centerX = ((bounds.minX + bounds.maxX) / 2) * scale;
    const centerY = ((bounds.minY + bounds.maxY) / 2) * scale;
    const targetStageX = viewportSize.width / 2 - centerX * clamped;
    const targetStageY = viewportSize.height / 2 - centerY * clamped;
    const newCenter = centerFor(clamped);
    setZoom(clamped);
    setPanOffset({ x: targetStageX - newCenter.x, y: targetStageY - newCenter.y });
  }

  useEffect(() => {
    if (!focusRequest) return;
    const panel = panels.find((p) => p.id === focusRequest.panelId);
    if (panel) focusOnPanel(panel);
    // Deliberately keyed on focusRequest alone (not e.g. panels/scale/viewportSize) —
    // this should only re-run when the CALLER asks for a new focus target (a new
    // panelId, or the same one again via a bumped requestId), not whenever the page's
    // own data happens to change in the background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

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
              label: panelDisplayLabel(p, i) + (resolvePanelForLanguage(p, activeLanguage).cut?.removed ? ` ${t("editor.panelInspector.removedSuffix")}` : ""),
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
    const resolvedCut = panel ? resolvePanelForLanguage(panel, activeLanguage).cut : undefined;
    return [
      ...(resolvedCut
        ? [
            {
              type: "action" as const,
              label: `${resolvedCut.flipHorizontal ? "✓ " : ""}${t("editor.contextMenu.flipHorizontal")}`,
              onClick: () => toggleCutFlip(panel!),
              disabled: panel?.locked,
            },
          ]
        : []),
      { type: "action", label: t("editor.contextMenu.duplicate"), onClick: onDuplicateSelected, disabled: panel?.locked },
      { type: "action", label: t("common.delete"), danger: true, onClick: onDeleteSelected, disabled: panel?.locked },
    ];
  }

  /** Toggles a Cut-Panel's horizontal-flip, scoped to the active language — same "write
   * into the language override if one exists, otherwise the shared base" rule
   * PanelInspector.tsx's commitPanel uses, kept in sync here since the context menu
   * writes straight through onChangePanel instead of going through the inspector. */
  function toggleCutFlip(panel: Panel) {
    const resolved = resolvePanelForLanguage(panel, activeLanguage);
    if (!resolved.cut) return;
    const cut = { ...resolved.cut, flipHorizontal: !resolved.cut.flipHorizontal || undefined };
    if (panel.languageOverride?.[activeLanguage]) {
      onChangePanel(panel.id, { languageOverride: { ...panel.languageOverride, [activeLanguage]: { ...resolved, cut } } });
    } else {
      onChangePanel(panel.id, { cut });
    }
  }

  /** Right-click menu for a single polygon vertex (a Panel point or a Quad-Bubble
   * corner) — kept separate from contextMenuEntries() since it needs the target's own
   * current points/corners (e.g. to disable point-removal at the 3-point floor)
   * rather than the layout at large. Writes straight to the target's base geometry
   * (onChangePanel/onChange), same as the existing drag handlers and "Punkt
   * entfernen" already do — no languageOverride involved for either Panel points or
   * Bubble corners at this level. */
  function vertexMenuEntries(): ContextMenuEntry[] {
    if (!vertexMenu) return [];
    const { kind, targetId, vertexIndex } = vertexMenu;
    const points = kind === "panel" ? panels.find((p) => p.id === targetId)?.points : bubbles.find((b) => b.id === targetId)?.corners;
    if (!points) return [];

    function applyAngle(fixedNeighbor: "previous" | "next", value: number) {
      const next = setVertexAngle(points!, vertexIndex, fixedNeighbor, value);
      if (kind === "panel") onChangePanel(targetId, { points: next });
      else onChange(targetId, { corners: next });
    }

    const entries: ContextMenuEntry[] = [
      {
        type: "numberInput",
        label: t("editor.contextMenu.setAngleFixPrevious"),
        placeholder: t("editor.contextMenu.anglePlaceholder"),
        defaultValue: 90,
        min: 1,
        max: 359,
        submitLabel: t("editor.contextMenu.applyAngle"),
        onSubmit: (value) => applyAngle("previous", value),
      },
      {
        type: "numberInput",
        label: t("editor.contextMenu.setAngleFixNext"),
        placeholder: t("editor.contextMenu.anglePlaceholder"),
        defaultValue: 90,
        min: 1,
        max: 359,
        submitLabel: t("editor.contextMenu.applyAngle"),
        onSubmit: (value) => applyAngle("next", value),
      },
    ];
    if (kind === "panel") {
      entries.push({
        type: "action",
        label: t("editor.contextMenu.removePoint"),
        disabled: points.length <= 3,
        onClick: () => onChangePanel(targetId, { points: points.filter((_, i) => i !== vertexIndex) }),
      });
    }
    return entries;
  }

  // Every Cut-Panel on the page, resolved for the active language — rendered as two full
  // passes below (see CutPanelContentShape.tsx's doc comment): first every panel's "hole"
  // phase, only then every panel's "foreground" phase, so a swap between two Cut-Panels
  // can never have a later panel's vacated-spot fill erase an earlier panel's
  // already-drawn content sitting in that same spot.
  const cutPanels = panels.filter((p) => resolvePanelForLanguage(p, activeLanguage).cut);
  // Stable-sort selected panels to the end of the foreground pass so a panel being
  // dragged into a swap renders above whichever Cut-Panel content it's currently
  // overlapping, instead of staying stuck at its fixed array index in the paint order.
  const cutPanelsForeground = [...cutPanels].sort((a, b) => Number(selectedPanelIds.includes(a.id)) - Number(selectedPanelIds.includes(b.id)));

  return (
    <div className="canvas-panel">
      <div className="canvas-titlebar">
        <span className="canvas-titlebar-name">{page}</span>
        <Link
          to={`/p/${encodeURIComponent(projectId)}/volumes/${encodeURIComponent(volumeId)}`}
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
            cutPanels.map((panel) => (
              <CutPanelContentShape
                key={`cut-hole-${panel.id}`}
                panel={panel}
                image={image}
                scale={scale}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                activeLanguage={activeLanguage}
                phase="hole"
              />
            ))}
          {image &&
            cutPanelsForeground.map((panel) => (
              <CutPanelContentShape
                key={`cut-fg-${panel.id}`}
                panel={panel}
                image={image}
                scale={scale}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                activeLanguage={activeLanguage}
                phase="foreground"
              />
            ))}
          {panels.map((panel, index) => (
            <PanelShape
              key={panel.id}
              panel={panel}
              index={index}
              scale={scale}
              zoom={zoom}
              activeLanguage={activeLanguage}
              selected={selectedPanelIds.includes(panel.id)}
              onSelect={(additive) => onSelectPanel(panel.id, additive)}
              onChange={(patch) => onChangePanel(panel.id, patch)}
              onContextMenu={(clientX, clientY) => setContextMenu({ x: clientX, y: clientY, kind: "panel", id: panel.id })}
              onVertexContextMenu={(clientX, clientY, vertexIndex) =>
                setVertexMenu({ x: clientX, y: clientY, kind: "panel", targetId: panel.id, vertexIndex })
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
                onCornerContextMenu={(clientX, clientY, vertexIndex) =>
                  setVertexMenu({ x: clientX, y: clientY, kind: "bubble", targetId: b.id, vertexIndex })
                }
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
                    onCornerContextMenu={(clientX, clientY, vertexIndex) =>
                      setVertexMenu({ x: clientX, y: clientY, kind: "bubble", targetId: b.id, vertexIndex })
                    }
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
          {comments.map((c) => (
            <CommentMarkerShape
              key={c.id}
              comment={c}
              scale={scale}
              selected={c.id === selectedCommentId}
              onSelect={(clientX, clientY) => onSelectComment(c.id, clientX, clientY)}
            />
          ))}
          {freehandDraft && freehandDraft.length > 1 && (
            <Line
              points={freehandDraft.flatMap((p) => [p.x, p.y])}
              stroke={FREEHAND_COMMENT_COLOR}
              strokeWidth={FREEHAND_COMMENT_WIDTH_PX}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
              listening={false}
            />
          )}
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
