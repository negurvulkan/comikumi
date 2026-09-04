import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  Bubble,
  BubbleBevel,
  BubbleBevelDirection,
  BubbleBevelStyle,
  BubbleForm,
  BubbleGradientFill,
  BubbleShapeKind,
  BubbleVisualStyle,
  EffectGlow,
  EffectShadow,
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
import { OptionalToggleField } from "./OptionalToggleField";
import { GovernedField } from "./GovernedField";
import { IconTabs } from "./IconTabs";
import { MessageCircleMore, Palette, Signature, Sparkles } from "lucide-react";
import { GlossaryHighlightedTextarea, findGlossaryReading } from "./GlossaryHighlightedTextarea";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { buildProjectSearchIndex, type IndexedBubble } from "./projectSearchIndex";
import { findSimilarBubbles, type TranslationMemorySuggestion } from "./translationMemory";
import { DASH_PRESETS, matchDashPreset, parseDashPattern, formatDashPattern } from "./dashPatterns";

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
  /** Keyboard-workflow mode (see Editor.tsx's navigateBubble) — Tab/Shift+Tab in the text
   * field jumps to the next/previous bubble in reading order instead of leaving the
   * field via the browser's default tab-order. Optional: omitting it just leaves Tab at
   * its native browser behavior. */
  onNavigate?: (direction: 1 | -1) => void;
  /** Bumped (any value change, e.g. an incrementing counter) by Editor.tsx right after an
   * onNavigate-triggered selection change, to focus+select this bubble's text field for
   * immediate typing — a plain mouse-click selection must NOT do this (would steal focus
   * from whatever the user was doing), so this is deliberately a separate signal from
   * `bubble` itself changing. */
  autoFocusSignal?: number;
}

type TabId = "text" | "form" | "textStyle" | "effects";

export function BubbleInspector({
  bubble,
  activeLanguage,
  panels,
  characters,
  glossary,
  presets,
  onChange,
  onReassignPanel,
  onDelete,
  onNavigate,
  autoFocusSignal,
}: Props) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>("text");

  // Two effects, not one: the text field only exists in the DOM while the "text" tab is
  // active, so switching tabs (if a different one was open) and focusing the now-mounted
  // textarea can't happen in the same synchronous pass — the second effect re-runs once
  // `activeTab` itself has actually flipped and the textarea has mounted. `lastFocusedSignalRef`
  // tracks which signal value has already been handled, so the second effect's `activeTab`
  // dependency doesn't also fire it on a later MANUAL tab click (which must never steal focus).
  const lastFocusedSignalRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (autoFocusSignal === undefined) return;
    setActiveTab("text");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusSignal]);

  useEffect(() => {
    if (autoFocusSignal === undefined || activeTab !== "text") return;
    if (lastFocusedSignalRef.current === autoFocusSignal) return;
    lastFocusedSignalRef.current = autoFocusSignal;
    textareaRef.current?.focus();
    textareaRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusSignal, activeTab]);

  // Translation memory (see translationMemory.ts) — an opt-in "search" button rather
  // than live-as-you-type: building the project-wide index (projectSearchIndex.ts)
  // fetches every volume's every page, which is too expensive to redo on each
  // keystroke. `tmIndexRef` caches the built index across searches within this
  // component instance (a fresh mount — e.g. navigating to a different bubble — starts
  // over; see the module doc comment for why no cross-request/session cache exists).
  const tmIndexRef = useRef<IndexedBubble[] | null>(null);
  const [tmSuggestions, setTmSuggestions] = useState<TranslationMemorySuggestion[] | null>(null);
  const [tmLoading, setTmLoading] = useState(false);
  const [tmError, setTmError] = useState<string | null>(null);

  async function searchTranslationMemory() {
    const query = bubble.text[activeLanguage] ?? "";
    setTmLoading(true);
    setTmError(null);
    try {
      if (!tmIndexRef.current) {
        const volumes = await api.listVolumes();
        tmIndexRef.current = await buildProjectSearchIndex(volumes);
      }
      setTmSuggestions(findSimilarBubbles(tmIndexRef.current, activeLanguage, query, bubble.id));
    } catch (e) {
      setTmError(translateApiError(e, t));
    } finally {
      setTmLoading(false);
    }
  }

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!onNavigate) return;
    // Tab already leaves the textarea natively (browsers don't insert a tab character in
    // a plain <textarea>), so hijacking it here doesn't take away any existing behavior —
    // it just redirects "leave this field" to "the next bubble" instead of "whatever's
    // next in the DOM's tab order". Ctrl/Cmd+Enter is the escape hatch for "done typing,
    // move on" without sacrificing plain Enter, which must stay a newline (dialogue is
    // frequently multi-line).
    if (e.key === "Tab") {
      e.preventDefault();
      onNavigate(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onNavigate(1);
    }
  }
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

  /** Tooltip text for GovernedField's 🔒 badge — the top-level "Linked to X" banner
   * (see the preset <select> below) says a preset is involved at all, but gives no
   * per-field signal for which of the many fields below it actually touches; this
   * fills that gap without repeating the full explanation at every field. */
  const lockTitle = preset ? t("editor.bubbleInspector.presetGovernsHint", { name: preset.name }) : undefined;

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
    if (preset.text.balloonAwareWrap !== undefined) textPatch.balloonAwareWrap = style.balloonAwareWrap;
    if (preset.text.color !== undefined) textPatch.color = style.color;
    if (preset.text.textOutline !== undefined) textPatch.textOutline = style.textOutline;
    if (preset.text.textGradient !== undefined) textPatch.textGradient = style.textGradient;
    if (preset.text.textGlow !== undefined) textPatch.textGlow = style.textGlow;
    if (preset.text.textDropShadow !== undefined) textPatch.textDropShadow = style.textDropShadow;
    if (!hasFormOverride) {
      if (preset.background.bubbleStyle !== undefined) textPatch.bubbleStyle = form.bubbleStyle;
      if (preset.background.fillColor !== undefined) textPatch.fillColor = form.fillColor;
      if (preset.background.strokeColor !== undefined) textPatch.strokeColor = form.strokeColor;
      if (preset.background.strokeWidthPx !== undefined) textPatch.strokeWidthPx = form.strokeWidthPx;
      if (preset.background.strokeDashPattern !== undefined) textPatch.strokeDashPattern = form.strokeDashPattern;
      if (preset.background.strokeDashOffsetPx !== undefined) textPatch.strokeDashOffsetPx = form.strokeDashOffsetPx;
      if (preset.background.backgroundGradientFill !== undefined) textPatch.backgroundGradientFill = form.backgroundGradientFill;
      if (preset.background.backgroundGlow !== undefined) textPatch.backgroundGlow = form.backgroundGlow;
      if (preset.background.backgroundDropShadow !== undefined) textPatch.backgroundDropShadow = form.backgroundDropShadow;
      if (preset.background.backgroundBevel !== undefined) textPatch.backgroundBevel = form.backgroundBevel;
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
  const balloonAwareWrapOverride = bubble.balloonAwareWrapOverride?.[activeLanguage];
  const hasEffectsOverride =
    bubble.textOutlineOverride?.[activeLanguage] !== undefined ||
    bubble.textGradientOverride?.[activeLanguage] !== undefined ||
    bubble.textGlowOverride?.[activeLanguage] !== undefined ||
    bubble.textDropShadowOverride?.[activeLanguage] !== undefined;
  const effectiveOutline = style.textOutline;
  const effectiveGradient = style.textGradient;
  const effectiveGlow = style.textGlow;
  const effectiveDropShadow = style.textDropShadow;

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

  function toggleBalloonAwareWrapOverride(checked: boolean) {
    const next = { ...(bubble.balloonAwareWrapOverride ?? {}) };
    if (checked) next[activeLanguage] = !!bubble.balloonAwareWrap;
    else delete next[activeLanguage];
    onChange({ balloonAwareWrapOverride: next });
  }

  function setBalloonAwareWrapOverride(value: boolean) {
    onChange({ balloonAwareWrapOverride: { ...(bubble.balloonAwareWrapOverride ?? {}), [activeLanguage]: value } });
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
        textGlowOverride: { ...(bubble.textGlowOverride ?? {}), [activeLanguage]: bubble.textGlow },
        textDropShadowOverride: { ...(bubble.textDropShadowOverride ?? {}), [activeLanguage]: bubble.textDropShadow },
      });
    } else {
      const nextOutline = { ...(bubble.textOutlineOverride ?? {}) };
      delete nextOutline[activeLanguage];
      const nextGradient = { ...(bubble.textGradientOverride ?? {}) };
      delete nextGradient[activeLanguage];
      const nextGlow = { ...(bubble.textGlowOverride ?? {}) };
      delete nextGlow[activeLanguage];
      const nextDropShadow = { ...(bubble.textDropShadowOverride ?? {}) };
      delete nextDropShadow[activeLanguage];
      onChange({
        textOutlineOverride: nextOutline,
        textGradientOverride: nextGradient,
        textGlowOverride: nextGlow,
        textDropShadowOverride: nextDropShadow,
      });
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

  function setTextGlow(patch: Partial<EffectGlow>) {
    if (hasEffectsOverride) {
      onChange({ textGlowOverride: { ...(bubble.textGlowOverride ?? {}), [activeLanguage]: { ...effectiveGlow, ...patch } } });
    } else {
      onChange({ textGlow: { ...bubble.textGlow, ...patch } });
    }
  }

  function setTextDropShadow(patch: Partial<EffectShadow>) {
    if (hasEffectsOverride) {
      onChange({ textDropShadowOverride: { ...(bubble.textDropShadowOverride ?? {}), [activeLanguage]: { ...effectiveDropShadow, ...patch } } });
    } else {
      onChange({ textDropShadow: { ...bubble.textDropShadow, ...patch } });
    }
  }

  function setBackgroundGradientFill(patch: Partial<BubbleGradientFill>) {
    setFormField({ backgroundGradientFill: { ...form.backgroundGradientFill, ...patch } });
  }

  function setBackgroundGlow(patch: Partial<EffectGlow>) {
    setFormField({ backgroundGlow: { ...form.backgroundGlow, ...patch } });
  }

  function setBackgroundDropShadow(patch: Partial<EffectShadow>) {
    setFormField({ backgroundDropShadow: { ...form.backgroundDropShadow, ...patch } });
  }

  function setBackgroundBevel(patch: Partial<BubbleBevel>) {
    setFormField({ backgroundBevel: { ...form.backgroundBevel, ...patch } });
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

  const tabs: { id: TabId; icon: typeof MessageCircleMore; label: string }[] = [
    { id: "text", icon: MessageCircleMore, label: t("editor.bubbleInspector.textTabLabel") },
    { id: "form", icon: Palette, label: t("editor.bubbleInspector.formAndStyleLabel") },
    { id: "textStyle", icon: Signature, label: t("editor.bubbleInspector.textStyleSectionTitle") },
    { id: "effects", icon: Sparkles, label: t("editor.bubbleInspector.textEffectsSectionTitle") },
  ];

  return (
    <div className="inspector">
      <IconTabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      {activeTab === "text" && (
        <>
          <label>
            {t("editor.bubbleInspector.textLabel", { language: activeLanguage })}
            <GlossaryHighlightedTextarea
              ref={textareaRef}
              value={bubble.text[activeLanguage] ?? ""}
              onChange={setText}
              glossary={glossary}
              activeLanguage={activeLanguage}
              vertical={style.direction === "vertical-rl"}
              onKeyDown={handleTextareaKeyDown}
              style={{
                fontFamily: style.fontFamily,
                writingMode: style.direction === "vertical-rl" ? "vertical-rl" : "horizontal-tb",
                direction: style.direction === "rtl" ? "rtl" : "ltr",
              }}
            />
          </label>

          <div className="field-row" style={{ marginBottom: 4 }}>
            <button type="button" onClick={searchTranslationMemory} disabled={tmLoading || !(bubble.text[activeLanguage] ?? "").trim()}>
              {tmLoading ? t("common.loading") : t("editor.bubbleInspector.tmSearchButton")}
            </button>
          </div>
          {tmError && <div className="error-banner">{tmError}</div>}
          {tmSuggestions && (
            <div style={{ marginBottom: 4 }}>
              {tmSuggestions.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  {t("editor.bubbleInspector.tmNoSuggestions")}
                </p>
              ) : (
                tmSuggestions.map((s) => (
                  <div key={`${s.volumeId}-${s.page}-${s.bubbleId}`} className="text-list-row" style={{ cursor: "default" }}>
                    <span className="text-list-type">
                      {s.volumeLabel} / {s.page}
                    </span>
                    <span className="text-list-content">{s.text}</span>
                    <button type="button" onClick={() => setText(s.text)}>
                      {t("editor.bubbleInspector.tmUseButton")}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

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

          <OptionalToggleField
            label={t("editor.bubbleInspector.isEffectLabel")}
            checked={!!bubble.isEffect}
            onToggle={(v) => onChange({ isEffect: v ? true : undefined })}
          />

          <div className="field-row">
            <label>
              Panel
              <select value={bubble.panelId ?? ""} onChange={(e) => onReassignPanel(e.target.value || null)}>
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
                <strong style={{ color: "var(--text)" }}>{t("editor.bubbleInspector.voiceNotesFor", { name: speaker.name })}</strong>{" "}
                {speaker.voiceNotes}
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
        </>
      )}

      {activeTab === "form" && (
        <>
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

              <GovernedField
                label={t("managers.presets.bubbleStyleLabel")}
                governed={backgroundPresetGoverns("bubbleStyle")}
                lockTitle={lockTitle}
              >
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
              </GovernedField>

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
                    <GovernedField
                      label={t("managers.presets.fillColorLabel")}
                      governed={backgroundPresetGoverns("fillColor")}
                      lockTitle={lockTitle}
                    >
                      <input
                        type="color"
                        value={form.fillColor}
                        onChange={(e) => setFormField({ fillColor: e.target.value })}
                        disabled={backgroundPresetGoverns("fillColor")}
                      />
                    </GovernedField>
                    <GovernedField
                      label={t("managers.presets.strokeColorLabel")}
                      governed={backgroundPresetGoverns("strokeColor")}
                      lockTitle={lockTitle}
                    >
                      <input
                        type="color"
                        value={form.strokeColor}
                        onChange={(e) => setFormField({ strokeColor: e.target.value })}
                        disabled={backgroundPresetGoverns("strokeColor")}
                      />
                    </GovernedField>
                  </div>
                  <GovernedField
                    label={t("managers.presets.strokeWidthLabel")}
                    governed={backgroundPresetGoverns("strokeWidthPx")}
                    lockTitle={lockTitle}
                  >
                    <input
                      type="number"
                      min={0}
                      value={form.strokeWidthPx}
                      onChange={(e) => setFormField({ strokeWidthPx: Number(e.target.value) })}
                      disabled={backgroundPresetGoverns("strokeWidthPx")}
                    />
                  </GovernedField>
                  <GovernedField
                    label={t("managers.presets.strokeDashLabel")}
                    governed={backgroundPresetGoverns("strokeDashPattern")}
                    lockTitle={lockTitle}
                  >
                    <div className="field-row" style={{ flexWrap: "wrap" }}>
                      <select
                        value={matchDashPreset(form.strokeDashPattern)}
                        onChange={(e) => {
                          const preset = DASH_PRESETS.find((p) => p.id === e.target.value);
                          if (preset) setFormField({ strokeDashPattern: preset.pattern });
                        }}
                        disabled={backgroundPresetGoverns("strokeDashPattern")}
                      >
                        <option value="solid">{t("managers.presets.strokeDashSolid")}</option>
                        <option value="dotted">{t("managers.presets.strokeDashDotted")}</option>
                        <option value="dashed">{t("managers.presets.strokeDashDashed")}</option>
                        <option value="dashDot">{t("managers.presets.strokeDashDashDot")}</option>
                        <option value="longDash">{t("managers.presets.strokeDashLongDash")}</option>
                        <option value="custom">{t("managers.presets.strokeDashCustom")}</option>
                      </select>
                      <label>
                        {t("editor.textEffects.strokeDashPatternLabel")}
                        <input
                          type="text"
                          value={formatDashPattern(form.strokeDashPattern)}
                          onChange={(e) => setFormField({ strokeDashPattern: parseDashPattern(e.target.value) })}
                          disabled={backgroundPresetGoverns("strokeDashPattern")}
                        />
                      </label>
                      <label>
                        {t("editor.textEffects.strokeDashOffsetLabel")}
                        <input
                          type="number"
                          value={form.strokeDashOffsetPx}
                          onChange={(e) => setFormField({ strokeDashOffsetPx: Number(e.target.value) })}
                          disabled={backgroundPresetGoverns("strokeDashPattern")}
                        />
                      </label>
                    </div>
                  </GovernedField>
                  {(form.bubbleStyle === "speech" ||
                    form.bubbleStyle === "shout" ||
                    form.bubbleStyle === "thought" ||
                    form.bubbleStyle === "svg") && (
                    <OptionalToggleField label={t("editor.bubbleInspector.showTail")} checked={!!form.tail} onToggle={toggleTail}>
                      <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>{t("editor.bubbleInspector.tailDragHint")}</p>
                      <GovernedField
                        label={t("managers.presets.tailStyleLabel")}
                        governed={backgroundPresetGoverns("tailStyle")}
                        lockTitle={lockTitle}
                      >
                        <select
                          value={effectiveTailStyle}
                          onChange={(e) => setFormField({ tailStyle: e.target.value as TailStyle })}
                          disabled={backgroundPresetGoverns("tailStyle")}
                        >
                          <option value="point">{t("managers.presets.tailStylePoint")}</option>
                          <option value="point-detached">{t("managers.presets.tailStylePointDetached")}</option>
                          <option value="chain">{t("managers.presets.tailStyleChain")}</option>
                        </select>
                      </GovernedField>
                      {effectiveTailStyle === "chain" && (
                        <>
                          <GovernedField
                            label={t("managers.presets.segmentShapeLabel")}
                            governed={backgroundPresetGoverns("tailChainSegmentShape")}
                            lockTitle={lockTitle}
                          >
                            <select
                              value={form.tailChainSegmentShape}
                              onChange={(e) => setFormField({ tailChainSegmentShape: e.target.value as TailChainSegmentShape })}
                              disabled={backgroundPresetGoverns("tailChainSegmentShape")}
                            >
                              <option value="circle">{t("managers.presets.segmentShapeCircle")}</option>
                              <option value="rect">{t("managers.presets.segmentShapeRect")}</option>
                              <option value="diamond">{t("managers.presets.segmentShapeDiamond")}</option>
                            </select>
                          </GovernedField>
                          <GovernedField
                            label={t("managers.presets.segmentsCountLabel")}
                            governed={backgroundPresetGoverns("tailChainSegments")}
                            lockTitle={lockTitle}
                          >
                            <input
                              type="number"
                              min={1}
                              max={8}
                              value={form.tailChainSegments}
                              onChange={(e) => setFormField({ tailChainSegments: Number(e.target.value) })}
                              disabled={backgroundPresetGoverns("tailChainSegments")}
                            />
                          </GovernedField>
                          <GovernedField
                            label={t("managers.presets.segmentSpacingLabel")}
                            governed={backgroundPresetGoverns("tailChainSpacing")}
                            lockTitle={lockTitle}
                          >
                            <input
                              type="number"
                              step={0.1}
                              min={0.1}
                              value={form.tailChainSpacing}
                              onChange={(e) => setFormField({ tailChainSpacing: Number(e.target.value) })}
                              disabled={backgroundPresetGoverns("tailChainSpacing")}
                            />
                          </GovernedField>
                        </>
                      )}
                    </OptionalToggleField>
                  )}
                </>
              )}

              <OptionalToggleField label={t("editor.bubbleInspector.clipEnabled")} checked={!!(form.clipA && form.clipB)} onToggle={toggleClip}>
                <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>{t("editor.bubbleInspector.clipDragHint")}</p>
                <div className="field-row">
                  <button type="button" onClick={() => setFormField({ clipFlip: !form.clipFlip })}>
                    {t("editor.bubbleInspector.clipFlip")}
                  </button>
                  <button type="button" onClick={suggestClipFromPanelEdge} disabled={!bubble.panelId}>
                    {t("editor.bubbleInspector.clipFromPanel")}
                  </button>
                </div>
              </OptionalToggleField>

              <OptionalToggleField
                label={t("editor.bubbleInspector.customPaddingLabel")}
                checked={form.paddingRatio !== null}
                disabled={backgroundPresetGoverns("paddingRatio")}
                onToggle={(checked) => setFormField({ paddingRatio: checked ? paddingRatioFor(form.bubbleStyle, bubble.shape) : null })}
              >
                <GovernedField
                  label={t("editor.bubbleInspector.paddingRatioLabel", { value: Math.round((form.paddingRatio ?? 0) * 100) })}
                  governed={backgroundPresetGoverns("paddingRatio")}
                  lockTitle={lockTitle}
                >
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={Math.round((form.paddingRatio ?? 0) * 100)}
                    disabled={backgroundPresetGoverns("paddingRatio")}
                    onChange={(e) => setFormField({ paddingRatio: Number(e.target.value) / 100 })}
                  />
                </GovernedField>
              </OptionalToggleField>
            </>
          )}
        </>
      )}

      {activeTab === "textStyle" && (
        <>
          <FontPicker
            value={style.fontFamily}
            onChange={(v) => (fontFamilyOverride !== undefined ? setFontFamilyOverride(v) : onChange({ fontFamily: v }))}
            disabled={textPresetGoverns("fontFamily", fontFamilyOverride !== undefined)}
            labelExtra={
              <>
                <ScopeSwitch
                  activeLanguage={activeLanguage}
                  scope={fontFamilyOverride !== undefined ? "language" : "all"}
                  onChange={(s) => toggleFontFamilyOverride(s === "language")}
                />
                {textPresetGoverns("fontFamily", fontFamilyOverride !== undefined) && (
                  <span className="preset-lock" title={lockTitle}>
                    🔒
                  </span>
                )}
              </>
            }
          />
          {textPresetGoverns("fontFamily", fontFamilyOverride !== undefined) && (
            <p className="hint" style={{ margin: "-4px 0 8px" }}>
              {t("editor.bubbleInspector.presetGovernsHint", { name: preset?.name })}
            </p>
          )}

          <div className="field-row">
            <GovernedField
              label={t("managers.presets.fontSizeLabel")}
              governed={textPresetGoverns("fontSize", fontSizeOverride !== undefined)}
              lockTitle={lockTitle}
              extra={
                <ScopeSwitch
                  activeLanguage={activeLanguage}
                  scope={fontSizeOverride !== undefined ? "language" : "all"}
                  onChange={(s) => toggleFontSizeOverride(s === "language")}
                />
              }
            >
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
            </GovernedField>
            <GovernedField
              label={t("managers.presets.lineHeightLabel")}
              governed={textPresetGoverns("lineHeight", lineHeightOverride !== undefined)}
              lockTitle={lockTitle}
              extra={
                <ScopeSwitch
                  activeLanguage={activeLanguage}
                  scope={lineHeightOverride !== undefined ? "language" : "all"}
                  onChange={(s) => toggleLineHeightOverride(s === "language")}
                />
              }
            >
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
            </GovernedField>
          </div>

          <GovernedField
            label={t("managers.presets.alignLabel")}
            governed={textPresetGoverns("align", alignOverride !== undefined)}
            lockTitle={lockTitle}
            extra={
              <ScopeSwitch
                activeLanguage={activeLanguage}
                scope={alignOverride !== undefined ? "language" : "all"}
                onChange={(s) => toggleAlignOverride(s === "language")}
              />
            }
          >
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
          </GovernedField>

          <GovernedField
            label={t("managers.presets.directionLabel")}
            governed={textPresetGoverns("direction", directionOverride !== undefined)}
            lockTitle={lockTitle}
            extra={
              <ScopeSwitch
                activeLanguage={activeLanguage}
                scope={directionOverride !== undefined ? "language" : "all"}
                onChange={(s) => toggleDirectionOverride(s === "language")}
              />
            }
          >
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
          </GovernedField>

          {bubble.shape === "oval" && (
            <GovernedField
              label={t("editor.bubbleInspector.balloonAwareWrapLabel")}
              governed={textPresetGoverns("balloonAwareWrap", balloonAwareWrapOverride !== undefined)}
              lockTitle={lockTitle}
              extra={
                <ScopeSwitch
                  activeLanguage={activeLanguage}
                  scope={balloonAwareWrapOverride !== undefined ? "language" : "all"}
                  onChange={(s) => toggleBalloonAwareWrapOverride(s === "language")}
                />
              }
            >
              <label className="field-row" style={{ alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={!!style.balloonAwareWrap}
                  disabled={textPresetGoverns("balloonAwareWrap", balloonAwareWrapOverride !== undefined)}
                  onChange={(e) => {
                    const v = e.target.checked;
                    if (balloonAwareWrapOverride !== undefined) setBalloonAwareWrapOverride(v);
                    else onChange({ balloonAwareWrap: v });
                  }}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("editor.bubbleInspector.balloonAwareWrapHint")}</span>
              </label>
            </GovernedField>
          )}
        </>
      )}

      {activeTab === "effects" && (
        <>
          <TextEffectsFields
            color={style.color}
            onColorChange={(color) => onChange({ color })}
            outline={effectiveOutline}
            onOutlineChange={setTextOutline}
            gradient={effectiveGradient}
            onGradientChange={setTextGradient}
            glow={effectiveGlow}
            onGlowChange={setTextGlow}
            dropShadow={effectiveDropShadow}
            onDropShadowChange={setTextDropShadow}
            activeLanguage={activeLanguage}
            hasLanguageOverride={hasEffectsOverride}
            onToggleLanguageOverride={toggleEffectsOverride}
            disabled={
              preset?.text.color !== undefined ||
              (!hasEffectsOverride &&
                (preset?.text.textOutline !== undefined ||
                  preset?.text.textGradient !== undefined ||
                  preset?.text.textGlow !== undefined ||
                  preset?.text.textDropShadow !== undefined))
            }
          />

          {bubble.shape !== "quad" && form.bubbleStyle !== "none" && (
            <>
              <div className="field-label-row" style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("editor.bubbleInspector.backgroundEffectsHeading")}</span>
              </div>

              <GovernedField
                label={t("managers.presets.backgroundGradientFillLabel")}
                governed={backgroundPresetGoverns("backgroundGradientFill")}
                lockTitle={lockTitle}
              >
                <OptionalToggleField
                  label={t("managers.presets.onLabel")}
                  checked={form.backgroundGradientFill.enabled}
                  disabled={backgroundPresetGoverns("backgroundGradientFill")}
                  onToggle={(enabled) => setBackgroundGradientFill({ enabled })}
                >
                  <div className="field-row">
                    <label>
                      {t("editor.textEffects.startColorLabel")}
                      <input
                        type="color"
                        value={form.backgroundGradientFill.colorStart}
                        onChange={(e) => setBackgroundGradientFill({ colorStart: e.target.value })}
                        disabled={backgroundPresetGoverns("backgroundGradientFill")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.endColorLabel")}
                      <input
                        type="color"
                        value={form.backgroundGradientFill.colorEnd}
                        onChange={(e) => setBackgroundGradientFill({ colorEnd: e.target.value })}
                        disabled={backgroundPresetGoverns("backgroundGradientFill")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.angleLabel")}
                      <input
                        type="number"
                        step={5}
                        value={form.backgroundGradientFill.angleDeg}
                        onChange={(e) => setBackgroundGradientFill({ angleDeg: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundGradientFill")}
                      />
                    </label>
                  </div>
                </OptionalToggleField>
              </GovernedField>

              <GovernedField
                label={t("managers.presets.backgroundGlowLabel")}
                governed={backgroundPresetGoverns("backgroundGlow")}
                lockTitle={lockTitle}
              >
                <OptionalToggleField
                  label={t("managers.presets.onLabel")}
                  checked={form.backgroundGlow.enabled}
                  disabled={backgroundPresetGoverns("backgroundGlow")}
                  onToggle={(enabled) => setBackgroundGlow({ enabled })}
                >
                  <div className="field-row">
                    <label>
                      {t("editor.textEffects.glowColorLabel")}
                      <input
                        type="color"
                        value={form.backgroundGlow.color}
                        onChange={(e) => setBackgroundGlow({ color: e.target.value })}
                        disabled={backgroundPresetGoverns("backgroundGlow")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.glowBlurLabel")}
                      <input
                        type="number"
                        min={0}
                        value={form.backgroundGlow.blurPx}
                        onChange={(e) => setBackgroundGlow({ blurPx: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundGlow")}
                      />
                    </label>
                  </div>
                </OptionalToggleField>
              </GovernedField>

              <GovernedField
                label={t("managers.presets.backgroundDropShadowLabel")}
                governed={backgroundPresetGoverns("backgroundDropShadow")}
                lockTitle={lockTitle}
              >
                <OptionalToggleField
                  label={t("managers.presets.onLabel")}
                  checked={form.backgroundDropShadow.enabled}
                  disabled={backgroundPresetGoverns("backgroundDropShadow")}
                  onToggle={(enabled) => setBackgroundDropShadow({ enabled })}
                >
                  <div className="field-row">
                    <label>
                      {t("editor.textEffects.shadowColorLabel")}
                      <input
                        type="color"
                        value={form.backgroundDropShadow.color}
                        onChange={(e) => setBackgroundDropShadow({ color: e.target.value })}
                        disabled={backgroundPresetGoverns("backgroundDropShadow")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.shadowBlurLabel")}
                      <input
                        type="number"
                        min={0}
                        value={form.backgroundDropShadow.blurPx}
                        onChange={(e) => setBackgroundDropShadow({ blurPx: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundDropShadow")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.shadowOffsetXLabel")}
                      <input
                        type="number"
                        value={form.backgroundDropShadow.offsetXPx}
                        onChange={(e) => setBackgroundDropShadow({ offsetXPx: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundDropShadow")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.shadowOffsetYLabel")}
                      <input
                        type="number"
                        value={form.backgroundDropShadow.offsetYPx}
                        onChange={(e) => setBackgroundDropShadow({ offsetYPx: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundDropShadow")}
                      />
                    </label>
                  </div>
                </OptionalToggleField>
              </GovernedField>

              <GovernedField
                label={t("managers.presets.backgroundBevelLabel")}
                governed={backgroundPresetGoverns("backgroundBevel")}
                lockTitle={lockTitle}
              >
                <OptionalToggleField
                  label={t("managers.presets.onLabel")}
                  checked={form.backgroundBevel.enabled}
                  disabled={backgroundPresetGoverns("backgroundBevel")}
                  onToggle={(enabled) => setBackgroundBevel({ enabled })}
                >
                  <div className="field-row" style={{ flexWrap: "wrap" }}>
                    <label>
                      {t("managers.presets.bevelStyleLabel")}
                      <select
                        value={form.backgroundBevel.style}
                        onChange={(e) => setBackgroundBevel({ style: e.target.value as BubbleBevelStyle })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      >
                        <option value="inner">{t("managers.presets.bevelStyleInner")}</option>
                        <option value="outer">{t("managers.presets.bevelStyleOuter")}</option>
                        <option value="emboss">{t("managers.presets.bevelStyleEmboss")}</option>
                      </select>
                    </label>
                    <label>
                      {t("managers.presets.bevelDirectionLabel")}
                      <select
                        value={form.backgroundBevel.direction}
                        onChange={(e) => setBackgroundBevel({ direction: e.target.value as BubbleBevelDirection })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      >
                        <option value="up">{t("managers.presets.bevelDirectionUp")}</option>
                        <option value="down">{t("managers.presets.bevelDirectionDown")}</option>
                      </select>
                    </label>
                  </div>
                  <div className="field-row" style={{ flexWrap: "wrap" }}>
                    <label>
                      {t("editor.textEffects.bevelSizeLabel")}
                      <input
                        type="number"
                        min={0}
                        value={form.backgroundBevel.sizePx}
                        onChange={(e) => setBackgroundBevel({ sizePx: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.angleLabel")}
                      <input
                        type="number"
                        step={5}
                        value={form.backgroundBevel.angleDeg}
                        onChange={(e) => setBackgroundBevel({ angleDeg: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.bevelSoftenLabel")}
                      <input
                        type="number"
                        min={0}
                        value={form.backgroundBevel.softenPx}
                        onChange={(e) => setBackgroundBevel({ softenPx: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      />
                    </label>
                  </div>
                  <div className="field-row" style={{ flexWrap: "wrap" }}>
                    <label>
                      {t("editor.textEffects.bevelHighlightColorLabel")}
                      <input
                        type="color"
                        value={form.backgroundBevel.highlightColor}
                        onChange={(e) => setBackgroundBevel({ highlightColor: e.target.value })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.bevelHighlightOpacityLabel")}
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.backgroundBevel.highlightOpacity}
                        onChange={(e) => setBackgroundBevel({ highlightOpacity: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.bevelShadowColorLabel")}
                      <input
                        type="color"
                        value={form.backgroundBevel.shadowColor}
                        onChange={(e) => setBackgroundBevel({ shadowColor: e.target.value })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      />
                    </label>
                    <label>
                      {t("editor.textEffects.bevelShadowOpacityLabel")}
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.backgroundBevel.shadowOpacity}
                        onChange={(e) => setBackgroundBevel({ shadowOpacity: Number(e.target.value) })}
                        disabled={backgroundPresetGoverns("backgroundBevel")}
                      />
                    </label>
                  </div>
                </OptionalToggleField>
              </GovernedField>
            </>
          )}
        </>
      )}

      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.bubbleInspector.deleteBubble")}
      </button>
    </div>
  );
}
