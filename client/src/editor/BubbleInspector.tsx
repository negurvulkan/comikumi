import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  Bubble,
  BubbleForm,
  BubbleShapeKind,
  BubbleVisualStyle,
  Panel,
  Point,
  TailChainSegmentShape,
  TailStyle,
  TextAlign,
  TextDirection,
  TextGradient,
  TextOutline,
} from "../../../shared/src/layoutSchema";
import {
  boxCorners,
  panelDisplayLabel,
  resolveBubbleForm,
  resolveBubbleStyle,
  resolveEffectiveTailStyle,
  resolvePanelForLanguage,
} from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { paddingRatioFor } from "../../../shared/src/rendering/textLayout";
import { FontPicker } from "./FontPicker";
import { TextEffectsFields } from "./TextEffectsFields";
import { SvgBubblePicker } from "./SvgBubblePicker";
import { ScopeSwitch } from "./ScopeSwitch";
import { GlossaryHighlightedTextarea, findGlossaryReading } from "./GlossaryHighlightedTextarea";

interface Props {
  bubble: Bubble;
  activeLanguage: string;
  panels: Panel[];
  characters: Character[];
  glossary: GlossaryEntry[];
  presets: LetteringPreset[];
  onChange: (patch: Partial<Bubble>) => void;
  /** Panel (re)assignment/detachment — goes through editorStore's reassignBubblePanel so
   * the bubble's coordinates convert between absolute and panel-relative correctly
   * (unlike every other field here, this can't be a plain onChange patch). */
  onReassignPanel: (panelId: string | null) => void;
  onDelete: () => void;
}

export function BubbleInspector({ bubble, activeLanguage, panels, characters, glossary, presets, onChange, onReassignPanel, onDelete }: Props) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const style = resolveBubbleStyle(bubble, activeLanguage, presets);
  const form = resolveBubbleForm(bubble, activeLanguage, presets);
  const hasFormOverride = !!bubble.formOverride?.[activeLanguage];
  const effectiveTailStyle = resolveEffectiveTailStyle(form.bubbleStyle, form.tailStyle);
  const preset = presets.find((p) => p.id === bubble.presetId);

  /** True when `field` is governed by the linked preset's text bundle and there's no
   * per-language override active for it right now (an override always wins, so it stays
   * editable even while a preset is linked — see resolveBubbleStyle's precedence). */
  function textPresetGoverns(field: keyof LetteringPreset["text"], overrideActive: boolean): boolean {
    return !overrideActive && preset?.text[field] !== undefined;
  }

  /** Same idea for the bubble-background bundle — governed by `hasFormOverride` instead
   * of a per-field override, since formOverride replaces the whole bundle at once. */
  function backgroundPresetGoverns(field: keyof LetteringPreset["background"]): boolean {
    return !hasFormOverride && preset?.background[field] !== undefined;
  }

  /** "Vom Preset lösen" — freezes every currently preset-governed field's resolved value
   * into the bubble's own base fields (so nothing visually jumps), then clears presetId.
   * Same "seed the current effective value before detaching" idiom already used by the
   * per-language override toggles below (e.g. toggleFontSizeOverride). */
  function detachFromPreset() {
    if (!preset) return;
    const textPatch: Partial<Bubble> = {};
    if (preset.text.fontFamily !== undefined) textPatch.fontFamily = style.fontFamily;
    if (preset.text.fontSize !== undefined) textPatch.fontSize = style.fontSize;
    if (preset.text.lineHeight !== undefined) textPatch.lineHeight = style.lineHeight;
    if (preset.text.align !== undefined) textPatch.align = style.align;
    if (preset.text.direction !== undefined) textPatch.direction = style.direction;
    if (preset.text.color !== undefined) textPatch.color = style.color;
    if (preset.text.textOutline !== undefined) textPatch.textOutline = style.textOutline;
    if (preset.text.textGradient !== undefined) textPatch.textGradient = style.textGradient;
    if (!hasFormOverride) {
      if (preset.background.bubbleStyle !== undefined) textPatch.bubbleStyle = form.bubbleStyle;
      if (preset.background.fillColor !== undefined) textPatch.fillColor = form.fillColor;
      if (preset.background.strokeColor !== undefined) textPatch.strokeColor = form.strokeColor;
      if (preset.background.strokeWidthPx !== undefined) textPatch.strokeWidthPx = form.strokeWidthPx;
      if (preset.background.svgFileName !== undefined) textPatch.svgFileName = form.svgFileName;
      if (preset.background.tailStyle !== undefined) textPatch.tailStyle = form.tailStyle;
      if (preset.background.tailChainSegmentShape !== undefined) textPatch.tailChainSegmentShape = form.tailChainSegmentShape;
      if (preset.background.tailChainSegments !== undefined) textPatch.tailChainSegments = form.tailChainSegments;
      if (preset.background.tailChainSpacing !== undefined) textPatch.tailChainSpacing = form.tailChainSpacing;
      if (preset.background.paddingRatio !== undefined) textPatch.paddingRatio = form.paddingRatio;
    }
    onChange({ ...textPatch, presetId: null });
  }

  const fontSizeOverride = bubble.fontSizeOverride?.[activeLanguage];
  const fontFamilyOverride = bubble.fontFamilyOverride?.[activeLanguage];
  const lineHeightOverride = bubble.lineHeightOverride?.[activeLanguage];
  const alignOverride = bubble.alignOverride?.[activeLanguage];
  const directionOverride = bubble.directionOverride?.[activeLanguage];
  const hasEffectsOverride =
    bubble.textOutlineOverride?.[activeLanguage] !== undefined || bubble.textGradientOverride?.[activeLanguage] !== undefined;
  const effectiveOutline = style.textOutline;
  const effectiveGradient = style.textGradient;

  function setText(value: string) {
    onChange({ text: { ...bubble.text, [activeLanguage]: value } });
  }

  /** Wraps the current text-field selection in vertical-typesetting markup (furigana
   * `{base|reading}` or bōten `{text*}`, see shared/src/rendering/verticalTypesetting.ts)
   * — a no-op if nothing is selected. Mirrors MentionInput.tsx's insert-at-cursor recipe:
   * commit the new full string via setText(), then on the next frame refocus the textarea
   * and restore the caret at the position `wrap()` requested (mid-insertion for furigana
   * with no known reading, so the translator can type it immediately; end-of-insertion
   * once nothing further needs typing). */
  function insertMarkup(wrap: (selected: string) => { text: string; caretOffset: number }) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) return;
    const value = bubble.text[activeLanguage] ?? "";
    const selected = value.slice(start, end);
    const { text: inserted, caretOffset } = wrap(selected);
    setText(value.slice(0, start) + inserted + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + caretOffset;
      el.setSelectionRange(pos, pos);
    });
  }

  function insertFurigana() {
    insertMarkup((selected) => {
      const reading = findGlossaryReading(selected, glossary, activeLanguage);
      if (reading) {
        const text = `{${selected}|${reading}}`;
        return { text, caretOffset: text.length };
      }
      return { text: `{${selected}|}`, caretOffset: selected.length + 2 };
    });
  }

  function insertBouten() {
    insertMarkup((selected) => {
      const text = `{${selected}*}`;
      return { text, caretOffset: text.length };
    });
  }

  function toggleFontSizeOverride(checked: boolean) {
    const next = { ...(bubble.fontSizeOverride ?? {}) };
    if (checked) next[activeLanguage] = bubble.fontSize;
    else delete next[activeLanguage];
    onChange({ fontSizeOverride: next });
  }

  function setFontSizeOverride(value: number) {
    onChange({ fontSizeOverride: { ...(bubble.fontSizeOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleFontFamilyOverride(checked: boolean) {
    const next = { ...(bubble.fontFamilyOverride ?? {}) };
    if (checked) next[activeLanguage] = bubble.fontFamily;
    else delete next[activeLanguage];
    onChange({ fontFamilyOverride: next });
  }

  function setFontFamilyOverride(value: string) {
    onChange({ fontFamilyOverride: { ...(bubble.fontFamilyOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleLineHeightOverride(checked: boolean) {
    const next = { ...(bubble.lineHeightOverride ?? {}) };
    if (checked) next[activeLanguage] = bubble.lineHeight;
    else delete next[activeLanguage];
    onChange({ lineHeightOverride: next });
  }

  function setLineHeightOverride(value: number) {
    onChange({ lineHeightOverride: { ...(bubble.lineHeightOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleAlignOverride(checked: boolean) {
    const next = { ...(bubble.alignOverride ?? {}) };
    if (checked) next[activeLanguage] = bubble.align;
    else delete next[activeLanguage];
    onChange({ alignOverride: next });
  }

  function setAlignOverride(value: TextAlign) {
    onChange({ alignOverride: { ...(bubble.alignOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleDirectionOverride(checked: boolean) {
    const next = { ...(bubble.directionOverride ?? {}) };
    if (checked) next[activeLanguage] = bubble.direction;
    else delete next[activeLanguage];
    onChange({ directionOverride: next });
  }

  function setDirectionOverride(value: TextDirection) {
    onChange({ directionOverride: { ...(bubble.directionOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleFormOverride(checked: boolean) {
    const next = { ...(bubble.formOverride ?? {}) };
    if (checked) next[activeLanguage] = resolveBubbleForm(bubble, activeLanguage);
    else delete next[activeLanguage];
    onChange({ formOverride: next });
  }

  // Writes into the active language's form override if one exists, otherwise
  // straight to the bubble's own base fields (shared field names by design —
  // see resolveBubbleForm / commitForm in BubbleShape.tsx for the same pattern
  // used when dragging/resizing on the canvas).
  function setFormField(patch: Partial<BubbleForm>) {
    if (hasFormOverride) {
      onChange({ formOverride: { ...bubble.formOverride, [activeLanguage]: { ...form, ...patch } } });
    } else {
      onChange(patch);
    }
  }

  function toggleEffectsOverride(checked: boolean) {
    if (checked) {
      onChange({
        textOutlineOverride: { ...(bubble.textOutlineOverride ?? {}), [activeLanguage]: bubble.textOutline },
        textGradientOverride: { ...(bubble.textGradientOverride ?? {}), [activeLanguage]: bubble.textGradient },
      });
    } else {
      const nextOutline = { ...(bubble.textOutlineOverride ?? {}) };
      delete nextOutline[activeLanguage];
      const nextGradient = { ...(bubble.textGradientOverride ?? {}) };
      delete nextGradient[activeLanguage];
      onChange({ textOutlineOverride: nextOutline, textGradientOverride: nextGradient });
    }
  }

  function setTextOutline(patch: Partial<TextOutline>) {
    if (hasEffectsOverride) {
      onChange({ textOutlineOverride: { ...(bubble.textOutlineOverride ?? {}), [activeLanguage]: { ...effectiveOutline, ...patch } } });
    } else {
      onChange({ textOutline: { ...bubble.textOutline, ...patch } });
    }
  }

  function setTextGradient(patch: Partial<TextGradient>) {
    if (hasEffectsOverride) {
      onChange({ textGradientOverride: { ...(bubble.textGradientOverride ?? {}), [activeLanguage]: { ...effectiveGradient, ...patch } } });
    } else {
      onChange({ textGradient: { ...bubble.textGradient, ...patch } });
    }
  }

  function toggleTail(checked: boolean) {
    setFormField({ tail: checked ? { x: form.width / 2, y: form.height + Math.max(30, form.height * 0.25) } : null });
  }

  function toggleClip(checked: boolean) {
    setFormField(
      checked
        ? { clipA: { x: form.width / 2, y: 0 }, clipB: { x: form.width / 2, y: form.height } }
        : { clipA: null, clipB: null }
    );
  }

  /** One-time suggestion, not a persistent binding (see the plan's "Nicht im Umfang") —
   * picks the assigned panel's polygon edge closest to the bubble's center and sets
   * clipA/clipB to it, ignoring the bubble's own rotation for simplicity (an acceptable
   * approximation for a starting point the user can still drag afterward). */
  function suggestClipFromPanelEdge() {
    const assignedPanel = panels.find((p) => p.id === bubble.panelId);
    if (!assignedPanel || assignedPanel.points.length < 2) return;
    const absX = form.x + assignedPanel.origin.x;
    const absY = form.y + assignedPanel.origin.y;
    const cx = absX + form.width / 2;
    const cy = absY + form.height / 2;
    let bestEdge: [Point, Point] | null = null;
    let bestDist = Infinity;
    const points = assignedPanel.points;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dist = Math.hypot((a.x + b.x) / 2 - cx, (a.y + b.y) / 2 - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = [a, b];
      }
    }
    if (!bestEdge) return;
    const [a, b] = bestEdge;
    setFormField({ clipA: { x: a.x - absX, y: a.y - absY }, clipB: { x: b.x - absX, y: b.y - absY } });
  }

  function changeShape(shape: BubbleShapeKind) {
    if (shape === "quad" && bubble.shape !== "quad") {
      onChange({ shape, corners: boxCorners(bubble.x, bubble.y, bubble.width, bubble.height) });
      return;
    }
    if (shape !== "quad" && bubble.shape === "quad" && bubble.corners) {
      const xs = bubble.corners.map((c) => c.x);
      const ys = bubble.corners.map((c) => c.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      onChange({ shape, x, y, width: Math.max(10, Math.max(...xs) - x), height: Math.max(10, Math.max(...ys) - y) });
      return;
    }
    onChange({ shape });
  }

  return (
    <div className="inspector">
      <label>
        {t("editor.bubbleInspector.textLabel", { language: activeLanguage })}
        <GlossaryHighlightedTextarea
          ref={textareaRef}
          value={bubble.text[activeLanguage] ?? ""}
          onChange={setText}
          glossary={glossary}
          activeLanguage={activeLanguage}
          vertical={style.direction === "vertical-rl"}
          style={{
            fontFamily: style.fontFamily,
            writingMode: style.direction === "vertical-rl" ? "vertical-rl" : "horizontal-tb",
            direction: style.direction === "rtl" ? "rtl" : "ltr",
          }}
        />
      </label>
      {style.direction === "vertical-rl" && (
        <>
          <div className="field-row" style={{ marginBottom: 4 }}>
            <button type="button" onClick={insertFurigana}>
              {t("editor.bubbleInspector.insertFuriganaButton")}
            </button>
            <button type="button" onClick={insertBouten}>
              {t("editor.bubbleInspector.insertBoutenButton")}
            </button>
          </div>
          <p style={{ color: "var(--text-muted)", margin: "-4px 0 4px", fontSize: 12 }}>
            {t("editor.bubbleInspector.furiganaHintPrefix")} <code>{"{漢字|かんじ}"}</code> {t("editor.bubbleInspector.furiganaHintSuffix")}
          </p>
          <p style={{ color: "var(--text-muted)", margin: "-4px 0 4px", fontSize: 12 }}>
            {t("editor.bubbleInspector.monoRubyHintPrefix")} <code>{"{東|とう}{京|きょう}"}</code> {t("editor.bubbleInspector.monoRubyHintSuffix")}
          </p>
          <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
            {t("editor.bubbleInspector.boutenHintPrefix")} <code>{"{text*}"}</code> {t("editor.bubbleInspector.boutenHintSuffix")}
          </p>
        </>
      )}

      <div className="field-row">
        <label>
          Panel
          <select
            value={bubble.panelId ?? ""}
            onChange={(e) => onReassignPanel(e.target.value || null)}
          >
            <option value="">{t("editor.contextMenu.noPanel")}</option>
            {panels.map((p, i) => (
              <option key={p.id} value={p.id}>
                {panelDisplayLabel(p, i)}
                {resolvePanelForLanguage(p, activeLanguage).cut?.removed ? ` ${t("editor.panelInspector.removedSuffix")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("editor.bubbleInspector.characterLabel")}
          <select value={bubble.characterId ?? ""} onChange={(e) => onChange({ characterId: e.target.value || null })}>
            <option value="">{t("editor.contextMenu.noCharacter")}</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(() => {
        const speaker = characters.find((c) => c.id === bubble.characterId);
        if (!speaker?.voiceNotes.trim()) return null;
        return (
          <p className="hint" style={{ margin: "-4px 0 8px", whiteSpace: "pre-wrap" }}>
            <strong style={{ color: "var(--text)" }}>{t("editor.bubbleInspector.voiceNotesFor", { name: speaker.name })}</strong> {speaker.voiceNotes}
          </p>
        );
      })()}

      <label>
        {t("managers.presets.title")}
        <select value={bubble.presetId ?? ""} onChange={(e) => onChange({ presetId: e.target.value || null })}>
          <option value="">{t("editor.contextMenu.noPreset")}</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {preset && (
        <p className="hint" style={{ margin: "-4px 0 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>{t("editor.bubbleInspector.presetLinkedHint", { name: preset.name })}</span>
          <button type="button" onClick={detachFromPreset}>
            {t("editor.bubbleInspector.detachFromPreset")}
          </button>
        </p>
      )}

      <label>
        {t("editor.bubbleInspector.shapeLabel")}
        <select value={bubble.shape} onChange={(e) => changeShape(e.target.value as BubbleShapeKind)}>
          <option value="rect">{t("editor.toolStrip.rect")}</option>
          <option value="oval">{t("editor.bubbleInspector.shapeOval")}</option>
          <option value="quad">{t("editor.bubbleInspector.shapeQuad")}</option>
        </select>
      </label>

      {bubble.shape !== "quad" && (
        <>
          <div className="field-label-row">
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("editor.bubbleInspector.formAndStyleLabel")}</span>
            <ScopeSwitch
              activeLanguage={activeLanguage}
              scope={hasFormOverride ? "language" : "all"}
              onChange={(s) => toggleFormOverride(s === "language")}
            />
          </div>
          {hasFormOverride && (
            <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>
              {t("editor.bubbleInspector.formOverrideHint", { language: activeLanguage })}
            </p>
          )}

          <label>
            {t("managers.presets.bubbleStyleLabel")}
            <select
              value={form.bubbleStyle}
              onChange={(e) => setFormField({ bubbleStyle: e.target.value as BubbleVisualStyle })}
              disabled={backgroundPresetGoverns("bubbleStyle")}
            >
              <option value="none">{t("editor.bubbleInspector.bubbleStyleNoneWithArt")}</option>
              <option value="speech">{t("managers.presets.bubbleStyleSpeech")}</option>
              <option value="thought">{t("managers.presets.bubbleStyleThought")}</option>
              <option value="shout">{t("managers.presets.bubbleStyleShout")}</option>
              <option value="svg">{t("managers.presets.bubbleStyleSvg")}</option>
            </select>
          </label>

          {form.bubbleStyle === "svg" && (
            <>
              <SvgBubblePicker onPick={(svgFileName) => setFormField({ svgFileName })} />
              {form.svgFileName ? (
                <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>
                  {t("editor.bubbleInspector.svgChosen", { name: form.svgFileName })}
                </p>
              ) : (
                <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>{t("editor.bubbleInspector.noSvgChosen")}</p>
              )}
            </>
          )}

          {form.bubbleStyle !== "none" && (
            <>
              <div className="field-row">
                <label>
                  {t("managers.presets.fillColorLabel")}
                  <input
                    type="color"
                    value={form.fillColor}
                    onChange={(e) => setFormField({ fillColor: e.target.value })}
                    disabled={backgroundPresetGoverns("fillColor")}
                  />
                </label>
                <label>
                  {t("managers.presets.strokeColorLabel")}
                  <input
                    type="color"
                    value={form.strokeColor}
                    onChange={(e) => setFormField({ strokeColor: e.target.value })}
                    disabled={backgroundPresetGoverns("strokeColor")}
                  />
                </label>
              </div>
              <label>
                {t("managers.presets.strokeWidthLabel")}
                <input
                  type="number"
                  min={0}
                  value={form.strokeWidthPx}
                  onChange={(e) => setFormField({ strokeWidthPx: Number(e.target.value) })}
                  disabled={backgroundPresetGoverns("strokeWidthPx")}
                />
              </label>
              {(form.bubbleStyle === "speech" || form.bubbleStyle === "shout" || form.bubbleStyle === "thought" || form.bubbleStyle === "svg") && (
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!form.tail} onChange={(e) => toggleTail(e.target.checked)} />
                  {t("editor.bubbleInspector.showTail")}
                </label>
              )}
              {form.tail && (
                <>
                  <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>
                    {t("editor.bubbleInspector.tailDragHint")}
                  </p>
                  <label>
                    {t("managers.presets.tailStyleLabel")}
                    <select
                      value={effectiveTailStyle}
                      onChange={(e) => setFormField({ tailStyle: e.target.value as TailStyle })}
                      disabled={backgroundPresetGoverns("tailStyle")}
                    >
                      <option value="point">{t("managers.presets.tailStylePoint")}</option>
                      <option value="point-detached">{t("managers.presets.tailStylePointDetached")}</option>
                      <option value="chain">{t("managers.presets.tailStyleChain")}</option>
                    </select>
                  </label>
                  {effectiveTailStyle === "chain" && (
                    <>
                      <label>
                        {t("managers.presets.segmentShapeLabel")}
                        <select
                          value={form.tailChainSegmentShape}
                          onChange={(e) => setFormField({ tailChainSegmentShape: e.target.value as TailChainSegmentShape })}
                          disabled={backgroundPresetGoverns("tailChainSegmentShape")}
                        >
                          <option value="circle">{t("managers.presets.segmentShapeCircle")}</option>
                          <option value="rect">{t("managers.presets.segmentShapeRect")}</option>
                          <option value="diamond">{t("managers.presets.segmentShapeDiamond")}</option>
                        </select>
                      </label>
                      <label>
                        {t("managers.presets.segmentsCountLabel")}
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={form.tailChainSegments}
                          onChange={(e) => setFormField({ tailChainSegments: Number(e.target.value) })}
                          disabled={backgroundPresetGoverns("tailChainSegments")}
                        />
                      </label>
                      <label>
                        {t("managers.presets.segmentSpacingLabel")}
                        <input
                          type="number"
                          step={0.1}
                          min={0.1}
                          value={form.tailChainSpacing}
                          onChange={(e) => setFormField({ tailChainSpacing: Number(e.target.value) })}
                          disabled={backgroundPresetGoverns("tailChainSpacing")}
                        />
                      </label>
                    </>
                  )}
                </>
              )}

              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={!!(form.clipA && form.clipB)} onChange={(e) => toggleClip(e.target.checked)} />
                {t("editor.bubbleInspector.clipEnabled")}
              </label>
              {form.clipA && form.clipB && (
                <>
                  <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>{t("editor.bubbleInspector.clipDragHint")}</p>
                  <div className="field-row">
                    <button type="button" onClick={() => setFormField({ clipFlip: !form.clipFlip })}>
                      {t("editor.bubbleInspector.clipFlip")}
                    </button>
                    <button type="button" onClick={suggestClipFromPanelEdge} disabled={!bubble.panelId}>
                      {t("editor.bubbleInspector.clipFromPanel")}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.paddingRatio !== null}
              disabled={backgroundPresetGoverns("paddingRatio")}
              onChange={(e) =>
                setFormField({ paddingRatio: e.target.checked ? paddingRatioFor(form.bubbleStyle, bubble.shape) : null })
              }
            />
            {t("editor.bubbleInspector.customPaddingLabel")}
          </label>
          {form.paddingRatio !== null && (
            <label>
              {t("editor.bubbleInspector.paddingRatioLabel", { value: Math.round(form.paddingRatio * 100) })}
              <input
                type="range"
                min={0}
                max={90}
                value={Math.round(form.paddingRatio * 100)}
                disabled={backgroundPresetGoverns("paddingRatio")}
                onChange={(e) => setFormField({ paddingRatio: Number(e.target.value) / 100 })}
              />
            </label>
          )}
        </>
      )}

      <FontPicker
        value={style.fontFamily}
        onChange={(v) => (fontFamilyOverride !== undefined ? setFontFamilyOverride(v) : onChange({ fontFamily: v }))}
        disabled={textPresetGoverns("fontFamily", fontFamilyOverride !== undefined)}
        labelExtra={
          <ScopeSwitch
            activeLanguage={activeLanguage}
            scope={fontFamilyOverride !== undefined ? "language" : "all"}
            onChange={(s) => toggleFontFamilyOverride(s === "language")}
          />
        }
      />
      {textPresetGoverns("fontFamily", fontFamilyOverride !== undefined) && (
        <p className="hint" style={{ margin: "-4px 0 8px" }}>
          {t("editor.bubbleInspector.presetGovernsHint", { name: preset?.name })}
        </p>
      )}

      <div className="field-row">
        <label>
          <span className="field-label-row">
            {t("managers.presets.fontSizeLabel")}
            <ScopeSwitch
              activeLanguage={activeLanguage}
              scope={fontSizeOverride !== undefined ? "language" : "all"}
              onChange={(s) => toggleFontSizeOverride(s === "language")}
            />
          </span>
          <input
            type="number"
            min={4}
            value={style.fontSize}
            disabled={textPresetGoverns("fontSize", fontSizeOverride !== undefined)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (fontSizeOverride !== undefined) setFontSizeOverride(v);
              else onChange({ fontSize: v });
            }}
          />
        </label>
        <label>
          <span className="field-label-row">
            {t("managers.presets.lineHeightLabel")}
            <ScopeSwitch
              activeLanguage={activeLanguage}
              scope={lineHeightOverride !== undefined ? "language" : "all"}
              onChange={(s) => toggleLineHeightOverride(s === "language")}
            />
          </span>
          <input
            type="number"
            step={0.1}
            min={0.8}
            value={style.lineHeight}
            disabled={textPresetGoverns("lineHeight", lineHeightOverride !== undefined)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (lineHeightOverride !== undefined) setLineHeightOverride(v);
              else onChange({ lineHeight: v });
            }}
          />
        </label>
      </div>

      <label>
        <span className="field-label-row">
          {t("managers.presets.alignLabel")}
          <ScopeSwitch
            activeLanguage={activeLanguage}
            scope={alignOverride !== undefined ? "language" : "all"}
            onChange={(s) => toggleAlignOverride(s === "language")}
          />
        </span>
        <select
          value={style.align}
          disabled={textPresetGoverns("align", alignOverride !== undefined)}
          onChange={(e) => {
            const v = e.target.value as TextAlign;
            if (alignOverride !== undefined) setAlignOverride(v);
            else onChange({ align: v });
          }}
        >
          <option value="left">{t("managers.presets.alignLeft")}</option>
          <option value="center">{t("managers.presets.alignCenter")}</option>
          <option value="right">{t("managers.presets.alignRight")}</option>
        </select>
      </label>

      <label>
        <span className="field-label-row">
          {t("managers.presets.directionLabel")}
          <ScopeSwitch
            activeLanguage={activeLanguage}
            scope={directionOverride !== undefined ? "language" : "all"}
            onChange={(s) => toggleDirectionOverride(s === "language")}
          />
        </span>
        <select
          value={style.direction}
          disabled={textPresetGoverns("direction", directionOverride !== undefined)}
          onChange={(e) => {
            const v = e.target.value as TextDirection;
            if (directionOverride !== undefined) setDirectionOverride(v);
            else onChange({ direction: v });
          }}
        >
          <option value="ltr">{t("managers.presets.directionLtr")}</option>
          <option value="rtl">{t("managers.presets.directionRtl")}</option>
          <option value="vertical-rl">{t("editor.bubbleInspector.directionVerticalRtl")}</option>
        </select>
      </label>

      <TextEffectsFields
        color={style.color}
        onColorChange={(color) => onChange({ color })}
        outline={effectiveOutline}
        onOutlineChange={setTextOutline}
        gradient={effectiveGradient}
        onGradientChange={setTextGradient}
        activeLanguage={activeLanguage}
        hasLanguageOverride={hasEffectsOverride}
        onToggleLanguageOverride={toggleEffectsOverride}
        disabled={
          preset?.text.color !== undefined ||
          (!hasEffectsOverride && (preset?.text.textOutline !== undefined || preset?.text.textGradient !== undefined))
        }
      />

      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.bubbleInspector.deleteBubble")}
      </button>
    </div>
  );
}
