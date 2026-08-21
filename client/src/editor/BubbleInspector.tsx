import type {
  Bubble,
  BubbleForm,
  BubbleShapeKind,
  BubbleVisualStyle,
  Panel,
  TailChainSegmentShape,
  TailStyle,
  TextAlign,
  TextDirection,
  TextGradient,
  TextOutline,
} from "../../../shared/src/layoutSchema";
import { boxCorners, panelDisplayLabel, resolveBubbleForm, resolveBubbleStyle, resolveEffectiveTailStyle } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { FontPicker } from "./FontPicker";
import { TextEffectsFields } from "./TextEffectsFields";
import { SvgBubblePicker } from "./SvgBubblePicker";
import { ScopeSwitch } from "./ScopeSwitch";
import { GlossaryHighlightedTextarea } from "./GlossaryHighlightedTextarea";

interface Props {
  bubble: Bubble;
  activeLanguage: string;
  panels: Panel[];
  characters: Character[];
  glossary: GlossaryEntry[];
  presets: LetteringPreset[];
  onChange: (patch: Partial<Bubble>) => void;
  onDelete: () => void;
}

export function BubbleInspector({ bubble, activeLanguage, panels, characters, glossary, presets, onChange, onDelete }: Props) {
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
        Text ({activeLanguage})
        <GlossaryHighlightedTextarea
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
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
          Furigana: <code>{"{漢字|かんじ}"}</code> · Zahlen-/Lateinpaare (z. B. „21“) werden automatisch quer gesetzt.
        </p>
      )}

      <div className="field-row">
        <label>
          Panel
          <select
            value={bubble.panelId ?? ""}
            onChange={(e) => onChange({ panelId: e.target.value || null, readingOrderOverride: undefined })}
          >
            <option value="">– kein Panel –</option>
            {panels.map((p, i) => (
              <option key={p.id} value={p.id}>
                {panelDisplayLabel(p, i)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Charakter
          <select value={bubble.characterId ?? ""} onChange={(e) => onChange({ characterId: e.target.value || null })}>
            <option value="">– kein Charakter –</option>
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
            <strong style={{ color: "var(--text)" }}>Voice Notes ({speaker.name}):</strong> {speaker.voiceNotes}
          </p>
        );
      })()}

      <label>
        Preset
        <select value={bubble.presetId ?? ""} onChange={(e) => onChange({ presetId: e.target.value || null })}>
          <option value="">– kein Preset –</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {preset && (
        <p className="hint" style={{ margin: "-4px 0 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>Verknüpft mit „{preset.name}" — legt fest, was unten deaktiviert ist.</span>
          <button type="button" onClick={detachFromPreset}>
            Vom Preset lösen
          </button>
        </p>
      )}

      <label>
        Form
        <select value={bubble.shape} onChange={(e) => changeShape(e.target.value as BubbleShapeKind)}>
          <option value="rect">Rechteck</option>
          <option value="oval">Oval</option>
          <option value="quad">Perspektive (Viereck)</option>
        </select>
      </label>

      {bubble.shape !== "quad" && (
        <>
          <div className="field-label-row">
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Form &amp; Stil</span>
            <ScopeSwitch
              activeLanguage={activeLanguage}
              scope={hasFormOverride ? "language" : "all"}
              onChange={(s) => toggleFormOverride(s === "language")}
            />
          </div>
          {hasFormOverride && (
            <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>
              Position/Größe/Rotation im Canvas anpassen — wirkt nur für „{activeLanguage}".
            </p>
          )}

          <label>
            Blasenstil
            <select
              value={form.bubbleStyle}
              onChange={(e) => setFormField({ bubbleStyle: e.target.value as BubbleVisualStyle })}
              disabled={backgroundPresetGoverns("bubbleStyle")}
            >
              <option value="none">Keine (unsichtbar, vorhandene Grafik)</option>
              <option value="speech">Sprechblase</option>
              <option value="thought">Gedankenblase</option>
              <option value="shout">Effekt (gezackt)</option>
              <option value="svg">SVG-Sprechblase</option>
            </select>
          </label>

          {form.bubbleStyle === "svg" && (
            <>
              <SvgBubblePicker onPick={(svgFileName) => setFormField({ svgFileName })} />
              {form.svgFileName ? (
                <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>Gewählt: {form.svgFileName}</p>
              ) : (
                <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>Noch keine Kontur gewählt.</p>
              )}
            </>
          )}

          {form.bubbleStyle !== "none" && (
            <>
              <div className="field-row">
                <label>
                  Füllfarbe
                  <input
                    type="color"
                    value={form.fillColor}
                    onChange={(e) => setFormField({ fillColor: e.target.value })}
                    disabled={backgroundPresetGoverns("fillColor")}
                  />
                </label>
                <label>
                  Randfarbe
                  <input
                    type="color"
                    value={form.strokeColor}
                    onChange={(e) => setFormField({ strokeColor: e.target.value })}
                    disabled={backgroundPresetGoverns("strokeColor")}
                  />
                </label>
              </div>
              <label>
                Randbreite
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
                  Zeiger anzeigen
                </label>
              )}
              {form.tail && (
                <>
                  <p style={{ color: "var(--text-muted)", margin: "0 0 8px", fontSize: 12 }}>
                    Position an der Blase (grün), Breite (orange), Krümmung (lila) und Spitze (blau) im Canvas per Greifer anpassen.
                  </p>
                  <label>
                    Zeigerart
                    <select
                      value={effectiveTailStyle}
                      onChange={(e) => setFormField({ tailStyle: e.target.value as TailStyle })}
                      disabled={backgroundPresetGoverns("tailStyle")}
                    >
                      <option value="point">Verbunden (nahtlos)</option>
                      <option value="point-detached">Freistehend</option>
                      <option value="chain">Kette</option>
                    </select>
                  </label>
                  {effectiveTailStyle === "chain" && (
                    <>
                      <label>
                        Segmentform
                        <select
                          value={form.tailChainSegmentShape}
                          onChange={(e) => setFormField({ tailChainSegmentShape: e.target.value as TailChainSegmentShape })}
                          disabled={backgroundPresetGoverns("tailChainSegmentShape")}
                        >
                          <option value="circle">Kreis</option>
                          <option value="rect">Rechteck</option>
                          <option value="diamond">Raute</option>
                        </select>
                      </label>
                      <label>
                        Anzahl Segmente
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
                        Abstand der Segmente
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
            </>
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
          Von Preset „{preset?.name}" vorgegeben.
        </p>
      )}

      <div className="field-row">
        <label>
          <span className="field-label-row">
            Schriftgröße
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
            Zeilenhöhe
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
          Ausrichtung
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
          <option value="left">Links</option>
          <option value="center">Zentriert</option>
          <option value="right">Rechts</option>
        </select>
      </label>

      <label>
        <span className="field-label-row">
          Leserichtung
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
          <option value="ltr">Horizontal, links → rechts</option>
          <option value="rtl">Horizontal, rechts → links</option>
          <option value="vertical-rl">Vertikal, Spalten rechts → links (JP)</option>
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
        Bubble löschen
      </button>
    </div>
  );
}
