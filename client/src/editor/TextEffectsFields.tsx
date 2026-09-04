import { useTranslation } from "react-i18next";
import type { BubbleScreentone, BubbleScreentonePattern, EffectGlow, EffectShadow, TextGradient, TextOutline } from "../../../shared/src/layoutSchema";
import { ScopeSwitch } from "./ScopeSwitch";

interface Props {
  color: string;
  onColorChange: (value: string) => void;
  outline: TextOutline;
  onOutlineChange: (patch: Partial<TextOutline>) => void;
  gradient: TextGradient;
  onGradientChange: (patch: Partial<TextGradient>) => void;
  screentone: BubbleScreentone;
  onScreentoneChange: (patch: Partial<BubbleScreentone>) => void;
  glow: EffectGlow;
  onGlowChange: (patch: Partial<EffectGlow>) => void;
  dropShadow: EffectShadow;
  onDropShadowChange: (patch: Partial<EffectShadow>) => void;
  activeLanguage: string;
  hasLanguageOverride: boolean;
  onToggleLanguageOverride: (checked: boolean) => void;
  /** True when a linked preset governs color/outline/gradient/glow/shadow and no
   * language override is active for them — inputs still show the preset's resolved
   * value but can't be edited directly (see BubbleInspector.tsx/CurvedTextInspector.tsx's
   * "Preset"-Zeile). */
  disabled?: boolean;
}

/** Farbe/Umrandung/Farbverlauf-Felder — von BubbleInspector und CurvedTextInspector geteilt,
 * damit beide nie auseinanderlaufen. Umrandung und Farbverlauf teilen sich einen einzigen
 * ScopeSwitch (hasLanguageOverride betrifft beide zusammen, siehe toggleEffectsOverride in
 * den Inspektoren). */
export function TextEffectsFields({
  color,
  onColorChange,
  outline,
  onOutlineChange,
  gradient,
  onGradientChange,
  screentone,
  onScreentoneChange,
  glow,
  onGlowChange,
  dropShadow,
  onDropShadowChange,
  activeLanguage,
  hasLanguageOverride,
  onToggleLanguageOverride,
  disabled,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      <label>
        {t("managers.presets.colorLabel")}
        <input type="color" value={color} onChange={(e) => onColorChange(e.target.value)} disabled={disabled} />
      </label>
      {disabled && (
        <p className="hint" style={{ margin: "-4px 0 8px" }}>
          {t("editor.textEffects.presetOverrideHint")}
        </p>
      )}
      {gradient.enabled && !screentone.enabled && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
          {t("editor.textEffects.gradientOverridesColorHint")}
        </p>
      )}
      {screentone.enabled && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
          {t("editor.textEffects.screentoneOverridesFillHint")}
        </p>
      )}

      <div className="field-label-row">
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("editor.textEffects.outlineAndGradientLabel")}</span>
        <ScopeSwitch
          activeLanguage={activeLanguage}
          scope={hasLanguageOverride ? "language" : "all"}
          onChange={(s) => onToggleLanguageOverride(s === "language")}
        />
      </div>

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={outline.enabled} onChange={(e) => onOutlineChange({ enabled: e.target.checked })} disabled={disabled} />
        {t("managers.presets.textOutlineLabel")}
      </label>
      {outline.enabled && (
        <div className="field-row">
          <label>
            {t("editor.textEffects.strokeColorTextLabel")}
            <input type="color" value={outline.color} onChange={(e) => onOutlineChange({ color: e.target.value })} disabled={disabled} />
          </label>
          <label>
            {t("editor.textEffects.strokeWidthTextLabel")}
            <input
              type="number"
              min={1}
              value={outline.widthPx}
              onChange={(e) => onOutlineChange({ widthPx: Number(e.target.value) })}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={gradient.enabled} onChange={(e) => onGradientChange({ enabled: e.target.checked })} disabled={disabled} />
        {t("managers.presets.textGradientLabel")}
      </label>
      {gradient.enabled && (
        <div className="field-row">
          <label>
            {t("editor.textEffects.startColorLabel")}
            <input type="color" value={gradient.colorStart} onChange={(e) => onGradientChange({ colorStart: e.target.value })} disabled={disabled} />
          </label>
          <label>
            {t("editor.textEffects.endColorLabel")}
            <input type="color" value={gradient.colorEnd} onChange={(e) => onGradientChange({ colorEnd: e.target.value })} disabled={disabled} />
          </label>
          <label>
            {t("editor.textEffects.angleLabel")}
            <input
              type="number"
              step={5}
              value={gradient.angleDeg}
              onChange={(e) => onGradientChange({ angleDeg: Number(e.target.value) })}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={screentone.enabled}
          onChange={(e) => onScreentoneChange({ enabled: e.target.checked })}
          disabled={disabled}
        />
        {t("managers.presets.textScreentoneLabel")}
      </label>
      {screentone.enabled && (
        <>
          <div className="field-row" style={{ flexWrap: "wrap" }}>
            <label>
              {t("editor.textEffects.screentonePatternLabel")}
              <select
                value={screentone.pattern}
                onChange={(e) => onScreentoneChange({ pattern: e.target.value as BubbleScreentonePattern })}
                disabled={disabled}
              >
                <option value="dots">{t("editor.textEffects.screentonePatternDots")}</option>
                <option value="lines">{t("editor.textEffects.screentonePatternLines")}</option>
                <option value="crosshatch">{t("editor.textEffects.screentonePatternCrosshatch")}</option>
              </select>
            </label>
            <label>
              {t("editor.textEffects.screentoneSpacingLabel")}
              <input
                type="number"
                min={1}
                value={screentone.spacingPx}
                onChange={(e) => onScreentoneChange({ spacingPx: Number(e.target.value) })}
                disabled={disabled}
              />
            </label>
            <label>
              {t("editor.textEffects.screentoneSizeRatioLabel")}
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={screentone.sizeRatio}
                onChange={(e) => onScreentoneChange({ sizeRatio: Number(e.target.value) })}
                disabled={disabled}
              />
            </label>
            <label>
              {t("editor.textEffects.angleLabel")}
              <input
                type="number"
                step={5}
                value={screentone.angleDeg}
                onChange={(e) => onScreentoneChange({ angleDeg: Number(e.target.value) })}
                disabled={disabled}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              {t("editor.textEffects.screentoneDotColorLabel")}
              <input
                type="color"
                value={screentone.dotColor}
                onChange={(e) => onScreentoneChange({ dotColor: e.target.value })}
                disabled={disabled}
              />
            </label>
            <label>
              {t("editor.textEffects.screentoneBackgroundColorLabel")}
              <input
                type="color"
                value={screentone.backgroundColor}
                onChange={(e) => onScreentoneChange({ backgroundColor: e.target.value })}
                disabled={disabled}
              />
            </label>
            <label>
              {t("editor.textEffects.screentoneOpacityLabel")}
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={screentone.opacity}
                onChange={(e) => onScreentoneChange({ opacity: Number(e.target.value) })}
                disabled={disabled}
              />
            </label>
          </div>
        </>
      )}

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={glow.enabled} onChange={(e) => onGlowChange({ enabled: e.target.checked })} disabled={disabled} />
        {t("managers.presets.textGlowLabel")}
      </label>
      {glow.enabled && (
        <div className="field-row">
          <label>
            {t("editor.textEffects.glowColorLabel")}
            <input type="color" value={glow.color} onChange={(e) => onGlowChange({ color: e.target.value })} disabled={disabled} />
          </label>
          <label>
            {t("editor.textEffects.glowBlurLabel")}
            <input
              type="number"
              min={0}
              value={glow.blurPx}
              onChange={(e) => onGlowChange({ blurPx: Number(e.target.value) })}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={dropShadow.enabled}
          onChange={(e) => onDropShadowChange({ enabled: e.target.checked })}
          disabled={disabled}
        />
        {t("managers.presets.textDropShadowLabel")}
      </label>
      {dropShadow.enabled && (
        <div className="field-row">
          <label>
            {t("editor.textEffects.shadowColorLabel")}
            <input type="color" value={dropShadow.color} onChange={(e) => onDropShadowChange({ color: e.target.value })} disabled={disabled} />
          </label>
          <label>
            {t("editor.textEffects.shadowBlurLabel")}
            <input
              type="number"
              min={0}
              value={dropShadow.blurPx}
              onChange={(e) => onDropShadowChange({ blurPx: Number(e.target.value) })}
              disabled={disabled}
            />
          </label>
          <label>
            {t("editor.textEffects.shadowOffsetXLabel")}
            <input
              type="number"
              value={dropShadow.offsetXPx}
              onChange={(e) => onDropShadowChange({ offsetXPx: Number(e.target.value) })}
              disabled={disabled}
            />
          </label>
          <label>
            {t("editor.textEffects.shadowOffsetYLabel")}
            <input
              type="number"
              value={dropShadow.offsetYPx}
              onChange={(e) => onDropShadowChange({ offsetYPx: Number(e.target.value) })}
              disabled={disabled}
            />
          </label>
        </div>
      )}
    </>
  );
}
