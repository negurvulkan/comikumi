import { useEffect, useMemo, useRef } from "react";
import { Circle, Ellipse, Group, Rect, Shape, Transformer } from "react-konva";
import Konva from "konva";
import type { Bubble, BubbleForm } from "../../../shared/src/layoutSchema";
import { resolveBubbleForm, resolveBubbleStyle, resolveEffectiveTailStyle } from "../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../shared/src/presets";
import { paddingRatioFor, fitHorizontalText } from "../../../shared/src/rendering/textLayout";
import { drawVerticalText, fitVerticalText } from "../../../shared/src/rendering/verticalTypesetting";
import {
  buildBoundaryForStyle,
  canHaveTail,
  drawBubbleBackground,
  perpendicularOffset,
  tailBasePoints,
} from "../../../shared/src/rendering/bubbleBackground";
import { applyTextFillStyle, drawStyledText, type TextFillStyle } from "../../../shared/src/rendering/textEffects";
import { getCachedSvgBubbleBoundary } from "../export/svgBubbleGeometry";
import { projectOntoPerpendicularBow } from "./geometry";
import { QuadBubbleShape } from "./QuadBubbleShape";
import { LockToggleHandle } from "./LockToggleHandle";

interface Props {
  bubble: Bubble;
  scale: number;
  /** Current interactive Stage zoom (PageCanvas.tsx) — handle radii below are divided by this so they stay a constant SCREEN size instead of visually ballooning at high zoom (they're defined in the Layer's local, pre-zoom coordinate space, which the Stage then scales). */
  zoom: number;
  activeLanguage: string;
  presets: LetteringPreset[];
  selected: boolean;
  /** `additive` is true on a shift-click — toggles this element into/out of a multi-selection instead of replacing it (see editorStore.ts's selectBubble). */
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<Bubble>) => void;
  /** Native screen coordinates (clientX/clientY) of a right-click on this bubble — used to position a ContextMenu (PageCanvas.tsx), independent of canvas zoom/pan. */
  onContextMenu?: (clientX: number, clientY: number) => void;
  /** Native screen coordinates of a right-click on one of a quad-bubble's 4 corner
   * handles, plus which corner index — only used by QuadBubbleShape (rect/oval bubbles
   * have no per-corner menu), forwarded here via the `{...props}` spread in
   * BubbleShape() below so callers don't need to special-case the shape kind. */
  onCornerContextMenu?: (clientX: number, clientY: number, cornerIndex: number) => void;
  /** Disables every drag/resize/rotate/tail-reshape handle (but not selection) — used
   * for the "translator" project role, which the server only lets change bubble .text
   * (see routes/layout.ts's diff guard). Selecting a bubble still works so its text
   * stays editable via BubbleInspector. */
  readOnly?: boolean;
}

// Reused across all bubbles purely for canvas text-metric measurement (never drawn).
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d")!;
  }
  return measureCtx;
}

export function BubbleShape(props: Props) {
  if (props.bubble.shape === "quad") return <QuadBubbleShape {...props} />;
  return <RectOvalBubbleShape {...props} />;
}

function RectOvalBubbleShape({ bubble, scale, zoom, activeLanguage, presets, selected, onSelect, onChange, onContextMenu, readOnly }: Props) {
  const handleScale = 1 / zoom;
  // `readOnly` = role-based restriction (e.g. translator), `bubble.locked` = the user's own
  // per-object lock — either one disables geometry handles, but the lock TOGGLE icon itself
  // must stay visible/usable under `locked` (that's how you undo it) and only actually hides
  // for `readOnly` (a translator shouldn't see/use it at all).
  const geometryDisabled = readOnly || bubble.locked;
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  // Resolved per-language position/size/rotation + visible background — falls
  // back to the bubble's own base fields when the active language has no
  // formOverride entry (see resolveBubbleForm / commitForm below).
  const form = useMemo(() => resolveBubbleForm(bubble, activeLanguage, presets), [bubble, activeLanguage, presets]);
  const hasFormOverride = !!bubble.formOverride?.[activeLanguage];

  const w = form.width * scale;
  const h = form.height * scale;
  const stroke = selected ? "#6c8cff" : undefined;
  const fill = selected ? "rgba(255,255,255,0.55)" : undefined;

  const text = bubble.text[activeLanguage] ?? "";
  const style = useMemo(() => resolveBubbleStyle(bubble, activeLanguage, presets), [bubble, activeLanguage, presets]);
  const baseFontSize = style.fontSize * scale;
  const ratio = paddingRatioFor(form.bubbleStyle, bubble.shape);
  const boxWidth = Math.max(1, w * (1 - ratio));
  const boxHeight = Math.max(1, h * (1 - ratio));
  const svgBoundary = form.bubbleStyle === "svg" ? getCachedSvgBubbleBoundary(form.svgFileName) : null;

  const isVertical = style.direction === "vertical-rl";

  // Same shrink-to-fit + wrap algorithm as the PNG export, run at display
  // scale, so the editor preview matches the exported result exactly.
  const fitted = useMemo(() => {
    if (!text || isVertical) return null;
    return fitHorizontalText(getMeasureCtx(), text, style.fontFamily, style.lineHeight, boxWidth, boxHeight, baseFontSize);
  }, [text, isVertical, style.fontFamily, style.lineHeight, boxWidth, boxHeight, baseFontSize]);

  const fittedVertical = useMemo(() => {
    if (!text || !isVertical) return null;
    return fitVerticalText(text, style.lineHeight, boxWidth, boxHeight, baseFontSize);
  }, [text, isVertical, style.lineHeight, boxWidth, boxHeight, baseFontSize]);

  // Writes a form patch to the per-language override (if the active language
  // already has one) or straight to the bubble's base fields otherwise — the
  // same field names are shared between Bubble and BubbleForm on purpose, so
  // a patch works unmodified in either case. This is what lets a translator
  // drag/resize/rotate/re-tail a bubble for just their language once they've
  // opted in via the inspector's "Eigene Form für diese Sprache" toggle.
  function commitForm(patch: Partial<BubbleForm>) {
    if (hasFormOverride) {
      onChange({ formOverride: { ...bubble.formOverride, [activeLanguage]: { ...form, ...patch } } });
    } else {
      onChange(patch);
    }
  }

  // The Group is anchored at the bubble's CENTER (offsetX/offsetY = w/2,h/2),
  // matching the PNG export, which rotates around bubble.x+width/2 / y+height/2.
  // Konva's default pivot is a node's own (x,y) — if that stayed the top-left
  // corner, rotated bubbles would visibly swing around the wrong point and drift
  // out of sync with the export.
  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    commitForm({ x: e.target.x() / scale - form.width / 2, y: e.target.y() / scale - form.height / 2 });
  }

  function handleTransformEnd() {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const newWidth = Math.max(10, form.width * scaleX);
    const newHeight = Math.max(10, form.height * scaleY);
    commitForm({
      x: node.x() / scale - newWidth / 2,
      y: node.y() / scale - newHeight / 2,
      width: newWidth,
      height: newHeight,
      rotation: node.rotation(),
    });
  }

  function handleTailDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    commitForm({ tail: { x: e.target.x() / scale, y: e.target.y() / scale } });
  }

  const effectiveTailStyle = resolveEffectiveTailStyle(form.bubbleStyle, form.tailStyle);
  const hasTail = !!form.tail && canHaveTail(form.bubbleStyle);
  // The point on the bubble the tail attaches to — an explicit, independently
  // draggable point once the user has set one, otherwise the original
  // automatic default of "wherever is nearest to the tip" (see
  // drawBubbleBackground in bubbleBackground.ts, which resolves the same way).
  const tailAnchorSource = form.tailAnchor ?? form.tail;

  // Computed for every tail style now (not just the width-adjustable ones) —
  // `nearestPoint` is where the anchor handle sits, `left`/`right` are only
  // shown for "point"/"point-detached" (see hasWidthAdjustableTail below;
  // "chain" doesn't use tailWidth at all, so its base has no width to show).
  const tailHandles = useMemo(() => {
    if (!hasTail || !tailAnchorSource) return null;
    const boundary = buildBoundaryForStyle(form.bubbleStyle, bubble.shape, w, h, svgBoundary);
    if (boundary.length < 3) return null;
    return tailBasePoints(boundary, { x: tailAnchorSource.x * scale, y: tailAnchorSource.y * scale }, form.tailWidth * scale);
  }, [hasTail, tailAnchorSource, form.bubbleStyle, form.tailWidth, bubble.shape, w, h, scale, svgBoundary]);

  const hasWidthAdjustableTail = tailHandles && (effectiveTailStyle === "point" || effectiveTailStyle === "point-detached");

  // Either width handle can be dragged — both derive from the single
  // tailWidth value, so moving one recomputes the width and both re-render
  // symmetrically around the tail's anchor.
  function handleTailWidthDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    if (!tailHandles) return;
    const dx = e.target.x() - tailHandles.nearestPoint.x;
    const dy = e.target.y() - tailHandles.nearestPoint.y;
    const newTailWidth = Math.max(4, (Math.hypot(dx, dy) * 2) / scale);
    commitForm({ tailWidth: newTailWidth });
  }

  function handleTailAnchorDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    commitForm({ tailAnchor: { x: e.target.x() / scale, y: e.target.y() / scale } });
  }

  // The curve handle sits at the perpendicular offset from the anchor->tip
  // midpoint by the current tailCurve amount — the exact same point
  // bubbleBackground.ts's drawBubbleBackground() bows its curves around, so
  // the handle always visually matches where the tail actually bends.
  const curveHandlePoint = useMemo(() => {
    if (!tailHandles || !form.tail) return null;
    const tipScaled = { x: form.tail.x * scale, y: form.tail.y * scale };
    return perpendicularOffset(tailHandles.nearestPoint, tipScaled, form.tailCurve * scale);
  }, [tailHandles, form.tail, form.tailCurve, scale]);

  // Projects the raw drag position onto the perpendicular axis (ignoring any
  // tangential drag component) so the stored value is a clean signed bow
  // amount — same "recompute from raw drag, handle snaps to the canonical
  // point on next render" pattern as handleTailWidthDragEnd above.
  function handleTailCurveDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    if (!tailHandles || !form.tail) return;
    const tipScaled = { x: form.tail.x * scale, y: form.tail.y * scale };
    const projected = projectOntoPerpendicularBow(tailHandles.nearestPoint, tipScaled, {
      x: e.target.x(),
      y: e.target.y(),
    });
    commitForm({ tailCurve: projected / scale });
  }

  return (
    <>
      <Group
        ref={groupRef}
        name="bubble"
        x={form.x * scale + w / 2}
        y={form.y * scale + h / 2}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={form.rotation}
        draggable={!readOnly}
        onClick={(e) => onSelect(e.evt.shiftKey)}
        onTap={() => onSelect(false)}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onSelect(false);
          onContextMenu?.(e.evt.clientX, e.evt.clientY);
        }}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {form.bubbleStyle !== "none" && (
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              drawBubbleBackground(ctx._context, form, bubble.shape, scale, svgBoundary);
            }}
          />
        )}
        {bubble.shape === "rect" ? (
          <Rect width={w} height={h} stroke={stroke} strokeWidth={2} fill={fill} />
        ) : (
          <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} stroke={stroke} strokeWidth={2} fill={fill} />
        )}
        {fitted && (
          // A raw Shape with a custom sceneFunc — not Konva's <Text> — because
          // Konva.Text caches per-fontFamily text-metrics the first time it draws
          // that family. If that first draw happens before a custom @font-face
          // finishes loading, the cache keeps the narrow fallback-font width
          // forever (even after the real font loads and paints), so wrap="none"
          // clips characters that actually fit. Drawing with plain ctx.fillText
          // — the same call the PNG export uses — sidesteps that cache entirely
          // and guarantees the preview matches the export pixel-for-pixel.
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              ctx.font = `${fitted.fontSize}px "${style.fontFamily}"`;
              ctx.textBaseline = "middle";
              ctx.textAlign = style.align;
              ctx.direction = style.direction === "rtl" ? "rtl" : "ltr";
              const anchorX =
                style.align === "left"
                  ? (w - boxWidth) / 2
                  : style.align === "right"
                    ? w - (w - boxWidth) / 2
                    : w / 2;
              const startY = h / 2 - fitted.blockHeight / 2 + fitted.lineStep / 2;
              const fillStyle: TextFillStyle = { color: style.color, outline: style.textOutline, gradient: style.textGradient };
              applyTextFillStyle(ctx._context, fillStyle, (w - boxWidth) / 2, startY - fitted.lineStep / 2, boxWidth, fitted.blockHeight, scale);
              fitted.lines.forEach((line, i) => {
                drawStyledText(ctx._context, line.text, anchorX, startY + i * fitted.lineStep, fillStyle);
              });
            }}
          />
        )}
        {fittedVertical && (
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              drawVerticalText(ctx._context, fittedVertical, w / 2, h / 2, boxWidth, {
                fontFamily: style.fontFamily,
                color: style.color,
                align: style.align,
                outline: style.textOutline,
                gradient: style.textGradient,
                scale,
              });
            }}
          />
        )}
        {selected && form.bubbleStyle !== "none" && form.tail && (
          <Circle
            x={form.tail.x * scale}
            y={form.tail.y * scale}
            radius={7 * handleScale}
            fill="#6c8cff"
            stroke="#12131a"
            strokeWidth={handleScale}
            draggable={!geometryDisabled}
            // Without this, the mousedown/dragstart bubbles up to the
            // (also draggable) parent Group, which then "wins" and drags the
            // whole bubble instead of just this handle — the tail visually
            // never moves relative to the bubble because both nodes get
            // dragged together as one rigid unit.
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              handleTailDragEnd(e);
            }}
          />
        )}
        {selected && tailHandles && (
          <Circle
            x={tailHandles.nearestPoint.x}
            y={tailHandles.nearestPoint.y}
            radius={6 * handleScale}
            fill="#4ddd8f"
            stroke="#12131a"
            strokeWidth={handleScale}
            draggable={!geometryDisabled}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              handleTailAnchorDragEnd(e);
            }}
          />
        )}
        {selected && curveHandlePoint && (
          <Circle
            x={curveHandlePoint.x}
            y={curveHandlePoint.y}
            radius={6 * handleScale}
            fill="#b06cff"
            stroke="#12131a"
            strokeWidth={handleScale}
            draggable={!geometryDisabled}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              handleTailCurveDragEnd(e);
            }}
          />
        )}
        {selected &&
          hasWidthAdjustableTail &&
          tailHandles &&
          [tailHandles.left, tailHandles.right].map((p, i) => (
            <Circle
              key={i}
              x={p.x}
              y={p.y}
              radius={5 * handleScale}
              fill="#ffb84d"
              stroke="#12131a"
              strokeWidth={handleScale}
              draggable={!geometryDisabled}
              onMouseDown={(e) => {
                e.cancelBubble = true;
              }}
              onDragStart={(e) => {
                e.cancelBubble = true;
              }}
              onDragMove={(e) => {
                e.cancelBubble = true;
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                handleTailWidthDragEnd(e);
              }}
            />
          ))}
        {selected && !readOnly && (
          <LockToggleHandle
            x={w + 14 * handleScale}
            y={-14 * handleScale}
            scale={handleScale}
            locked={!!bubble.locked}
            onToggle={() => onChange({ locked: bubble.locked ? undefined : true })}
          />
        )}
      </Group>
      {selected && !geometryDisabled && (
        <Transformer
          ref={trRef}
          rotateEnabled
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10 ? oldBox : newBox)}
        />
      )}
    </>
  );
}
