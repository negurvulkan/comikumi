import { useEffect, useMemo, useRef } from "react";
import { Circle, Ellipse, Group, Rect, Shape, Text, Transformer } from "react-konva";
import Konva from "konva";
import type { Bubble, BubbleForm } from "../../../shared/src/layoutSchema";
import { resolveBubbleForm, resolveBubbleStyle, resolveEffectiveTailStyle } from "../../../shared/src/layoutSchema";
import type { LetteringPreset } from "../../../shared/src/presets";
import { fitHorizontalText, textBoxFor } from "../../../shared/src/rendering/textLayout";
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
import { computeMergedBoundary, type MergeMemberInput } from "../export/bubbleMerge";
import { projectOntoPerpendicularBow } from "./geometry";
import { QuadBubbleShape } from "./QuadBubbleShape";
import { LockToggleHandle } from "./LockToggleHandle";

interface Props {
  bubble: Bubble;
  /** Every bubble in the same parenting context (unassigned bubbles, or one panel's
   * children — see PageCanvas.tsx) — used to look up this bubble's merge-group siblings
   * (Bubble.mergeGroupId) for the live merged-outline preview. A merge group spanning two
   * different panels won't find its other member here (falls back to drawing unmerged) —
   * see the plan's "Nicht im Umfang". Omitted entirely by QuadBubbleShape's call sites
   * (quad bubbles are never mergeable). */
  allBubbles?: Bubble[];
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

function RectOvalBubbleShape({ bubble, allBubbles, scale, zoom, activeLanguage, presets, selected, onSelect, onChange, onContextMenu, readOnly }: Props) {
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
  const svgBoundary = form.bubbleStyle === "svg" ? getCachedSvgBubbleBoundary(form.svgFileName) : null;

  // Non-destructive bubble merging (Bubble.mergeGroupId/mergePrimary, see
  // shared/src/layoutSchema.ts) — siblings are looked up from `allBubbles` (this bubble's
  // own parenting context, see the Props doc comment above). A stale/lone mergeGroupId
  // (fewer than 2 live, non-"quad" members) falls back to drawing this bubble normally.
  const mergeSiblings = useMemo(() => {
    if (!bubble.mergeGroupId || !allBubbles) return null;
    const members = allBubbles.filter((b) => b.mergeGroupId === bubble.mergeGroupId && b.shape !== "quad");
    return members.length >= 2 ? members : null;
  }, [bubble.mergeGroupId, allBubbles]);
  const isMergedNonPrimary = !!mergeSiblings && !bubble.mergePrimary;

  // Only computed for the primary member — the union of every sibling's own boundary
  // (each resolved for the active language), scaled to match buildBoundaryForStyle's own
  // scaled-coordinate convention (see drawBubbleBackground in bubbleBackground.ts).
  const mergedBoundaryScaled = useMemo(() => {
    if (!mergeSiblings || !bubble.mergePrimary) return null;
    const members: MergeMemberInput[] = mergeSiblings.map((m) => {
      const mForm = m.id === bubble.id ? form : resolveBubbleForm(m, activeLanguage, presets);
      return { bubble: m, form: mForm, svgBoundary: mForm.bubbleStyle === "svg" ? getCachedSvgBubbleBoundary(mForm.svgFileName) : null };
    });
    const primary = members.find((m) => m.bubble.id === bubble.id);
    if (!primary) return null;
    return computeMergedBoundary(members, primary).map((p) => ({ x: p.x * scale, y: p.y * scale }));
  }, [mergeSiblings, bubble.mergePrimary, bubble.id, form, activeLanguage, presets, scale]);

  const mergedBoundsScaled = useMemo(() => {
    if (!mergedBoundaryScaled || mergedBoundaryScaled.length === 0) return null;
    const xs = mergedBoundaryScaled.map((p) => p.x);
    const ys = mergedBoundaryScaled.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }, [mergedBoundaryScaled]);

  const textBox = useMemo(
    () => textBoxFor(form.bubbleStyle, bubble.shape, form, scale, mergedBoundsScaled ?? undefined),
    [form, bubble.shape, scale, mergedBoundsScaled]
  );
  const boxWidth = Math.max(1, textBox.width);
  const boxHeight = Math.max(1, textBox.height);

  const isVertical = style.direction === "vertical-rl";

  // Balloon-aware wrapping only applies to a plain (non-merged, non-clipped)
  // oval — a merged group's boundary is an arbitrary polygon union, and a
  // clip line cuts the box along a straight edge, neither of which the
  // closed-form ellipse formula in ovalRowWidth accounts for. Falls back to
  // the existing flat-rectangle wrap in both cases, same as when the toggle
  // is off.
  const balloonGeometry = useMemo(() => {
    if (bubble.shape !== "oval" || !style.balloonAwareWrap) return undefined;
    if (mergedBoundsScaled || (form.clipA && form.clipB)) return undefined;
    return { shape: bubble.shape, balloonAwareWrap: style.balloonAwareWrap, bubbleWidth: form.width * scale, bubbleHeight: form.height * scale };
  }, [bubble.shape, style.balloonAwareWrap, form.width, form.height, form.clipA, form.clipB, mergedBoundsScaled, scale]);

  // Same shrink-to-fit + wrap algorithm as the PNG export, run at display
  // scale, so the editor preview matches the exported result exactly.
  const fitted = useMemo(() => {
    if (!text || isVertical) return null;
    return fitHorizontalText(getMeasureCtx(), text, style.fontFamily, style.lineHeight, boxWidth, boxHeight, baseFontSize, balloonGeometry);
  }, [text, isVertical, style.fontFamily, style.lineHeight, boxWidth, boxHeight, baseFontSize, balloonGeometry]);

  const fittedVertical = useMemo(() => {
    if (!text || !isVertical) return null;
    return fitVerticalText(text, style.lineHeight, boxWidth, boxHeight, baseFontSize, balloonGeometry);
  }, [text, isVertical, style.lineHeight, boxWidth, boxHeight, baseFontSize, balloonGeometry]);

  // True when the text still doesn't fit its box even after fitHorizontalText/
  // fitVerticalText shrank it all the way to MIN_FONT_SIZE — neither function reports
  // this itself (see their own doc comments), so it's the same comparison a caller who
  // already has boxWidth/boxHeight in scope can make directly: blockHeight (horizontal)
  // or blockWidth (vertical, since tategaki columns grow sideways) exceeding the box
  // means clamping stopped the shrink, not the text actually fitting.
  const overflows = fitted ? fitted.blockHeight > boxHeight : fittedVertical ? fittedVertical.blockWidth > boxWidth : false;

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

  // The clip line (Bubble.clipA/clipB, see layoutSchema.ts) is enabled/disabled from
  // BubbleInspector.tsx — these two handles only reposition an already-set line.
  function handleClipADragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    commitForm({ clipA: { x: e.target.x() / scale, y: e.target.y() / scale } });
  }
  function handleClipBDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    commitForm({ clipB: { x: e.target.x() / scale, y: e.target.y() / scale } });
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
        draggable={!geometryDisabled}
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
        {form.bubbleStyle !== "none" && !isMergedNonPrimary && (
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              drawBubbleBackground(ctx._context, form, bubble.shape, scale, svgBoundary, mergedBoundaryScaled ?? undefined);
            }}
          />
        )}
        {bubble.shape === "rect" ? (
          <Rect width={w} height={h} stroke={stroke} strokeWidth={2} fill={fill} />
        ) : (
          <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} stroke={stroke} strokeWidth={2} fill={fill} />
        )}
        {fitted && !isMergedNonPrimary && (
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
                  ? textBox.x
                  : style.align === "right"
                    ? textBox.x + textBox.width
                    : textBox.x + textBox.width / 2;
              const startY = textBox.y + textBox.height / 2 - fitted.blockHeight / 2 + fitted.lineStep / 2;
              const fillStyle: TextFillStyle = { color: style.color, outline: style.textOutline, gradient: style.textGradient };
              applyTextFillStyle(ctx._context, fillStyle, textBox.x, startY - fitted.lineStep / 2, textBox.width, fitted.blockHeight, scale);
              fitted.lines.forEach((line, i) => {
                drawStyledText(ctx._context, line.text, anchorX, startY + i * fitted.lineStep, fillStyle);
              });
            }}
          />
        )}
        {fittedVertical && !isMergedNonPrimary && (
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              drawVerticalText(ctx._context, fittedVertical, textBox.x + textBox.width / 2, textBox.y + textBox.height / 2, boxWidth, {
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
        {overflows && !isMergedNonPrimary && (
          // Live overflow warning — a translation that no longer fits even at the
          // smallest allowed font size (see the `overflows` doc comment above). Purely
          // visual (listening=false so it never intercepts clicks/drags meant for the
          // bubble underneath); the dashed red outline stays legible over any fill
          // color, and the badge is anchored top-right in the bubble's own unrotated
          // local space, so it rotates/scales along with the bubble for free.
          <>
            <Rect width={w} height={h} stroke="#ff3b30" strokeWidth={2} dash={[6, 4]} listening={false} />
            <Text
              text="⚠"
              x={w - 20}
              y={2}
              fontSize={16}
              listening={false}
              shadowColor="#000"
              shadowBlur={2}
              shadowOpacity={0.6}
            />
          </>
        )}
        {selected && !isMergedNonPrimary && form.bubbleStyle !== "none" && form.tail && (
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
        {selected && !isMergedNonPrimary && tailHandles && (
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
        {selected && !isMergedNonPrimary && curveHandlePoint && (
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
          !isMergedNonPrimary &&
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
        {selected &&
          !geometryDisabled &&
          !isMergedNonPrimary &&
          form.clipA &&
          form.clipB &&
          [
            { point: form.clipA, onDragEnd: handleClipADragEnd },
            { point: form.clipB, onDragEnd: handleClipBDragEnd },
          ].map((h, i) => (
            <Circle
              key={i}
              x={h.point.x * scale}
              y={h.point.y * scale}
              radius={6 * handleScale}
              fill="#ff6ec7"
              stroke="#12131a"
              strokeWidth={handleScale}
              draggable
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
                h.onDragEnd(e);
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
