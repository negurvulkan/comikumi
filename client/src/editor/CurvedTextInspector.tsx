import { useTranslation } from "react-i18next";
import type { CurvedTextElement, EffectGlow, EffectShadow, TextAlign, TextGradient, TextOutline } from "../../../shared/src/layoutSchema";
import { resolveCurvedTextStyle } from "../../../shared/src/layoutSchema";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { FontPicker } from "./FontPicker";
import { TextEffectsFields } from "./TextEffectsFields";
import { ScopeSwitch } from "./ScopeSwitch";
import { GovernedField } from "./GovernedField";
import { GlossaryHighlightedTextarea } from "./GlossaryHighlightedTextarea";

interface Props {
  element: CurvedTextElement;
  activeLanguage: string;
  glossary: GlossaryEntry[];
  presets: LetteringPreset[];
  onChange: (patch: Partial<CurvedTextElement>) => void;
  onDelete: () => void;
}

export function CurvedTextInspector({ element, activeLanguage, glossary, presets, onChange, onDelete }: Props) {
  const { t } = useTranslation();
  // Resolved via the shared resolver (language override > linked preset > own base
  // value) — same single source of truth used by the canvas preview and PNG export,
  // instead of the field-by-field override chains this component used to duplicate.
  const style = resolveCurvedTextStyle(element, activeLanguage, presets);
  const preset = presets.find((p) => p.id === element.presetId);

  const fontSizeOverride = element.fontSizeOverride?.[activeLanguage];
  const fontFamilyOverride = element.fontFamilyOverride?.[activeLanguage];
  const alignOverride = element.alignOverride?.[activeLanguage];
  const hasEffectsOverride =
    element.textOutlineOverride?.[activeLanguage] !== undefined ||
    element.textGradientOverride?.[activeLanguage] !== undefined ||
    element.textGlowOverride?.[activeLanguage] !== undefined ||
    element.textDropShadowOverride?.[activeLanguage] !== undefined;
  const effectiveOutline = style.textOutline;
  const effectiveGradient = style.textGradient;
  const effectiveGlow = style.textGlow;
  const effectiveDropShadow = style.textDropShadow;

  /** Same idea as BubbleInspector.tsx's textPresetGoverns. */
  function textPresetGoverns(field: keyof LetteringPreset["text"], overrideActive: boolean): boolean {
    return !overrideActive && preset?.text[field] !== undefined;
  }

  function detachFromPreset() {
    if (!preset) return;
    const patch: Partial<CurvedTextElement> = {};
    if (preset.text.fontFamily !== undefined) patch.fontFamily = style.fontFamily;
    if (preset.text.fontSize !== undefined) patch.fontSize = style.fontSize;
    if (preset.text.align !== undefined) patch.align = style.align;
    if (preset.text.color !== undefined) patch.color = style.color;
    if (preset.text.textOutline !== undefined) patch.textOutline = style.textOutline;
    if (preset.text.textGradient !== undefined) patch.textGradient = style.textGradient;
    if (preset.text.textGlow !== undefined) patch.textGlow = style.textGlow;
    if (preset.text.textDropShadow !== undefined) patch.textDropShadow = style.textDropShadow;
    onChange({ ...patch, presetId: null });
  }

  function setText(value: string) {
    onChange({ text: { ...element.text, [activeLanguage]: value } });
  }

  function toggleFontSizeOverride(checked: boolean) {
    const next = { ...(element.fontSizeOverride ?? {}) };
    if (checked) next[activeLanguage] = element.fontSize;
    else delete next[activeLanguage];
    onChange({ fontSizeOverride: next });
  }

  function setFontSizeOverride(value: number) {
    onChange({ fontSizeOverride: { ...(element.fontSizeOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleFontFamilyOverride(checked: boolean) {
    const next = { ...(element.fontFamilyOverride ?? {}) };
    if (checked) next[activeLanguage] = element.fontFamily;
    else delete next[activeLanguage];
    onChange({ fontFamilyOverride: next });
  }

  function setFontFamilyOverride(value: string) {
    onChange({ fontFamilyOverride: { ...(element.fontFamilyOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleAlignOverride(checked: boolean) {
    const next = { ...(element.alignOverride ?? {}) };
    if (checked) next[activeLanguage] = element.align;
    else delete next[activeLanguage];
    onChange({ alignOverride: next });
  }

  function setAlignOverride(value: TextAlign) {
    onChange({ alignOverride: { ...(element.alignOverride ?? {}), [activeLanguage]: value } });
  }

  function toggleEffectsOverride(checked: boolean) {
    if (checked) {
      onChange({
        textOutlineOverride: { ...(element.textOutlineOverride ?? {}), [activeLanguage]: element.textOutline },
        textGradientOverride: { ...(element.textGradientOverride ?? {}), [activeLanguage]: element.textGradient },
        textGlowOverride: { ...(element.textGlowOverride ?? {}), [activeLanguage]: element.textGlow },
        textDropShadowOverride: { ...(element.textDropShadowOverride ?? {}), [activeLanguage]: element.textDropShadow },
      });
    } else {
      const nextOutline = { ...(element.textOutlineOverride ?? {}) };
      delete nextOutline[activeLanguage];
      const nextGradient = { ...(element.textGradientOverride ?? {}) };
      delete nextGradient[activeLanguage];
      const nextGlow = { ...(element.textGlowOverride ?? {}) };
      delete nextGlow[activeLanguage];
      const nextDropShadow = { ...(element.textDropShadowOverride ?? {}) };
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
      onChange({ textOutlineOverride: { ...(element.textOutlineOverride ?? {}), [activeLanguage]: { ...effectiveOutline, ...patch } } });
    } else {
      onChange({ textOutline: { ...element.textOutline, ...patch } });
    }
  }

  function setTextGradient(patch: Partial<TextGradient>) {
    if (hasEffectsOverride) {
      onChange({ textGradientOverride: { ...(element.textGradientOverride ?? {}), [activeLanguage]: { ...effectiveGradient, ...patch } } });
    } else {
      onChange({ textGradient: { ...element.textGradient, ...patch } });
    }
  }

  function setTextGlow(patch: Partial<EffectGlow>) {
    if (hasEffectsOverride) {
      onChange({ textGlowOverride: { ...(element.textGlowOverride ?? {}), [activeLanguage]: { ...effectiveGlow, ...patch } } });
    } else {
      onChange({ textGlow: { ...element.textGlow, ...patch } });
    }
  }

  function setTextDropShadow(patch: Partial<EffectShadow>) {
    if (hasEffectsOverride) {
      onChange({ textDropShadowOverride: { ...(element.textDropShadowOverride ?? {}), [activeLanguage]: { ...effectiveDropShadow, ...patch } } });
    } else {
      onChange({ textDropShadow: { ...element.textDropShadow, ...patch } });
    }
  }

  return (
    <div className="inspector">
      <p className="hint" style={{ margin: 0 }}>
        {t("editor.curvedTextInspector.dragHint")}
      </p>

      <label>
        {t("editor.bubbleInspector.textLabel", { language: activeLanguage })}
        <GlossaryHighlightedTextarea
          value={element.text[activeLanguage] ?? ""}
          onChange={setText}
          glossary={glossary}
          activeLanguage={activeLanguage}
          style={{ fontFamily: style.fontFamily }}
        />
      </label>

      <label>
        {t("managers.presets.title")}
        <select value={element.presetId ?? ""} onChange={(e) => onChange({ presetId: e.target.value || null })}>
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
            {textPresetGoverns("fontFamily", fontFamilyOverride !== undefined) && preset && (
              <span className="preset-lock" title={t("editor.bubbleInspector.presetGovernsHint", { name: preset.name })}>
                🔒
              </span>
            )}
          </>
        }
      />

      <GovernedField
        label={t("editor.curvedTextInspector.fontSizeBaseLabel")}
        governed={textPresetGoverns("fontSize", fontSizeOverride !== undefined)}
        lockTitle={preset ? t("editor.bubbleInspector.presetGovernsHint", { name: preset.name }) : undefined}
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
      <p className="hint" style={{ margin: "-4px 0 8px" }}>
        {t("editor.curvedTextInspector.shrinkHint")}
      </p>

      <GovernedField
        label={t("editor.curvedTextInspector.alignOnCurveLabel")}
        governed={textPresetGoverns("align", alignOverride !== undefined)}
        lockTitle={preset ? t("editor.bubbleInspector.presetGovernsHint", { name: preset.name }) : undefined}
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
          <option value="left">{t("editor.curvedTextInspector.alignStart")}</option>
          <option value="center">{t("managers.presets.alignCenter")}</option>
          <option value="right">{t("editor.curvedTextInspector.alignEnd")}</option>
        </select>
      </GovernedField>

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

      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.curvedTextInspector.deleteCurvedText")}
      </button>
    </div>
  );
}
