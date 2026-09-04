import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";
import type {
  BubbleBevelDirection,
  BubbleBevelStyle,
  BubbleScreentonePattern,
  BubbleVisualStyle,
  TailChainSegmentShape,
  TailStyle,
  TextAlign,
  TextDirection,
} from "../../../shared/src/layoutSchema";
import { FontPicker } from "./FontPicker";
import { SvgBubblePicker } from "./SvgBubblePicker";
import { OptionalToggleField } from "./OptionalToggleField";
import { PresetFieldToggle } from "./PresetFieldToggle";
import { IconTabs } from "./IconTabs";
import { Signature, Sparkles, Palette, Wand2 } from "lucide-react";
import { DASH_PRESETS, matchDashPreset, parseDashPattern, formatDashPattern } from "./dashPatterns";
import { DEFAULT_TEXT, DEFAULT_BACKGROUND } from "./presetDefaults";

interface Props {
  text: PresetTextFields;
  background: PresetBackgroundFields;
  onTextChange: <K extends keyof PresetTextFields>(key: K, value: PresetTextFields[K] | undefined) => void;
  onBackgroundChange: <K extends keyof PresetBackgroundFields>(key: K, value: PresetBackgroundFields[K] | undefined) => void;
}

type TabId = "text" | "textEffects" | "background" | "backgroundEffects";

/** The middle column of the redesigned PresetManager — same tab/field-wrapper visual
 * language as BubbleInspector.tsx (IconTabs, one tab's content mounted at a time), but
 * every field uses PresetFieldToggle's sparse on/off semantics instead of
 * BubbleInspector's always-defined GovernedField, since a preset field can be entirely
 * absent (see PresetFieldToggle.tsx's doc comment). Split into 4 tabs (was one long
 * scrolling list of 26 fields) so no single tab exceeds ~11 fields. */
export function PresetPropertiesPanel({ text, background, onTextChange, onBackgroundChange }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("text");
  const showTailChain = background.tailStyle === "chain";

  const tabs: { id: TabId; icon: typeof Signature; label: string }[] = [
    { id: "text", icon: Signature, label: t("managers.presets.textTabLabel") },
    { id: "textEffects", icon: Sparkles, label: t("managers.presets.textEffectsTabLabel") },
    { id: "background", icon: Palette, label: t("managers.presets.backgroundTabLabel") },
    { id: "backgroundEffects", icon: Wand2, label: t("managers.presets.backgroundEffectsTabLabel") },
  ];

  return (
    <div className="inspector preset-properties-panel">
      <IconTabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      {activeTab === "text" && (
        <>
          <PresetFieldToggle label={t("managers.presets.fontFamilyLabel")} value={text.fontFamily} defaultValue={DEFAULT_TEXT.fontFamily} onChange={(v) => onTextChange("fontFamily", v)}>
            {(v, set) => <FontPicker value={v} onChange={set} />}
          </PresetFieldToggle>

          <PresetFieldToggle label={t("managers.presets.fontSizeLabel")} value={text.fontSize} defaultValue={DEFAULT_TEXT.fontSize} onChange={(v) => onTextChange("fontSize", v)}>
            {(v, set) => <input type="number" min={4} value={v} onChange={(e) => set(Number(e.target.value))} />}
          </PresetFieldToggle>

          <PresetFieldToggle label={t("managers.presets.lineHeightLabel")} value={text.lineHeight} defaultValue={DEFAULT_TEXT.lineHeight} onChange={(v) => onTextChange("lineHeight", v)}>
            {(v, set) => <input type="number" step={0.1} min={0.8} value={v} onChange={(e) => set(Number(e.target.value))} />}
          </PresetFieldToggle>

          <PresetFieldToggle label={t("managers.presets.alignLabel")} value={text.align} defaultValue={DEFAULT_TEXT.align} onChange={(v) => onTextChange("align", v)}>
            {(v, set) => (
              <select value={v} onChange={(e) => set(e.target.value as TextAlign)}>
                <option value="left">{t("managers.presets.alignLeft")}</option>
                <option value="center">{t("managers.presets.alignCenter")}</option>
                <option value="right">{t("managers.presets.alignRight")}</option>
              </select>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle label={t("managers.presets.directionLabel")} value={text.direction} defaultValue={DEFAULT_TEXT.direction} onChange={(v) => onTextChange("direction", v)}>
            {(v, set) => (
              <select value={v} onChange={(e) => set(e.target.value as TextDirection)}>
                <option value="ltr">{t("managers.presets.directionLtr")}</option>
                <option value="rtl">{t("managers.presets.directionRtl")}</option>
                <option value="vertical-rl">{t("managers.presets.directionVertical")}</option>
              </select>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.balloonAwareWrapLabel")}
            value={text.balloonAwareWrap}
            defaultValue={DEFAULT_TEXT.balloonAwareWrap}
            onChange={(v) => onTextChange("balloonAwareWrap", v)}
          >
            {(v, set) => <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />}
          </PresetFieldToggle>

          <PresetFieldToggle label={t("managers.presets.colorLabel")} value={text.color} defaultValue={DEFAULT_TEXT.color} onChange={(v) => onTextChange("color", v)}>
            {(v, set) => <input type="color" value={v} onChange={(e) => set(e.target.value)} />}
          </PresetFieldToggle>
        </>
      )}

      {activeTab === "textEffects" && (
        <>
          <PresetFieldToggle label={t("managers.presets.textOutlineLabel")} value={text.textOutline} defaultValue={DEFAULT_TEXT.textOutline} onChange={(v) => onTextChange("textOutline", v)}>
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row">
                  <input type="color" value={v.color} onChange={(e) => set({ ...v, color: e.target.value })} />
                  <input type="number" min={1} value={v.widthPx} onChange={(e) => set({ ...v, widthPx: Number(e.target.value) })} />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle label={t("managers.presets.textGradientLabel")} value={text.textGradient} defaultValue={DEFAULT_TEXT.textGradient} onChange={(v) => onTextChange("textGradient", v)}>
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row">
                  <input type="color" value={v.colorStart} onChange={(e) => set({ ...v, colorStart: e.target.value })} />
                  <input type="color" value={v.colorEnd} onChange={(e) => set({ ...v, colorEnd: e.target.value })} />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.textScreentoneLabel")}
            value={text.textScreentone}
            defaultValue={DEFAULT_TEXT.textScreentone}
            onChange={(v) => onTextChange("textScreentone", v)}
          >
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row" style={{ flexWrap: "wrap" }}>
                  <select value={v.pattern} onChange={(e) => set({ ...v, pattern: e.target.value as BubbleScreentonePattern })}>
                    <option value="dots">{t("editor.textEffects.screentonePatternDots")}</option>
                    <option value="lines">{t("editor.textEffects.screentonePatternLines")}</option>
                    <option value="crosshatch">{t("editor.textEffects.screentonePatternCrosshatch")}</option>
                  </select>
                  <input type="number" min={1} value={v.spacingPx} onChange={(e) => set({ ...v, spacingPx: Number(e.target.value) })} />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.sizeRatio}
                    onChange={(e) => set({ ...v, sizeRatio: Number(e.target.value) })}
                  />
                  <input type="number" step={5} value={v.angleDeg} onChange={(e) => set({ ...v, angleDeg: Number(e.target.value) })} />
                  <input type="color" value={v.dotColor} onChange={(e) => set({ ...v, dotColor: e.target.value })} />
                  <input type="color" value={v.backgroundColor} onChange={(e) => set({ ...v, backgroundColor: e.target.value })} />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.opacity}
                    onChange={(e) => set({ ...v, opacity: Number(e.target.value) })}
                  />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle label={t("managers.presets.textGlowLabel")} value={text.textGlow} defaultValue={DEFAULT_TEXT.textGlow} onChange={(v) => onTextChange("textGlow", v)}>
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row">
                  <input type="color" value={v.color} onChange={(e) => set({ ...v, color: e.target.value })} />
                  <input type="number" min={0} value={v.blurPx} onChange={(e) => set({ ...v, blurPx: Number(e.target.value) })} />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.textDropShadowLabel")}
            value={text.textDropShadow}
            defaultValue={DEFAULT_TEXT.textDropShadow}
            onChange={(v) => onTextChange("textDropShadow", v)}
          >
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row" style={{ flexWrap: "wrap" }}>
                  <input type="color" value={v.color} onChange={(e) => set({ ...v, color: e.target.value })} />
                  <input type="number" min={0} value={v.blurPx} onChange={(e) => set({ ...v, blurPx: Number(e.target.value) })} />
                  <input type="number" value={v.offsetXPx} onChange={(e) => set({ ...v, offsetXPx: Number(e.target.value) })} />
                  <input type="number" value={v.offsetYPx} onChange={(e) => set({ ...v, offsetYPx: Number(e.target.value) })} />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>
        </>
      )}

      {activeTab === "background" && (
        <>
          <PresetFieldToggle
            label={t("managers.presets.bubbleStyleLabel")}
            value={background.bubbleStyle}
            defaultValue={DEFAULT_BACKGROUND.bubbleStyle}
            onChange={(v) => onBackgroundChange("bubbleStyle", v)}
          >
            {(v, set) => (
              <select value={v} onChange={(e) => set(e.target.value as BubbleVisualStyle)}>
                <option value="none">{t("managers.presets.bubbleStyleNone")}</option>
                <option value="speech">{t("managers.presets.bubbleStyleSpeech")}</option>
                <option value="thought">{t("managers.presets.bubbleStyleThought")}</option>
                <option value="shout">{t("managers.presets.bubbleStyleShout")}</option>
                <option value="svg">{t("managers.presets.bubbleStyleSvg")}</option>
              </select>
            )}
          </PresetFieldToggle>

          {background.bubbleStyle === "svg" && (
            <PresetFieldToggle
              label={t("managers.presets.svgFileLabel")}
              value={background.svgFileName}
              defaultValue={DEFAULT_BACKGROUND.svgFileName}
              onChange={(v) => onBackgroundChange("svgFileName", v)}
            >
              {(v, set) => (
                <>
                  <SvgBubblePicker onPick={(fileName) => set(fileName)} />
                  {v ? (
                    <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 12 }}>{t("editor.bubbleInspector.svgChosen", { name: v })}</p>
                  ) : (
                    <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 12 }}>{t("editor.bubbleInspector.noSvgChosen")}</p>
                  )}
                </>
              )}
            </PresetFieldToggle>
          )}

          <div className="field-row">
            <PresetFieldToggle label={t("managers.presets.fillColorLabel")} value={background.fillColor} defaultValue={DEFAULT_BACKGROUND.fillColor} onChange={(v) => onBackgroundChange("fillColor", v)}>
              {(v, set) => <input type="color" value={v} onChange={(e) => set(e.target.value)} />}
            </PresetFieldToggle>
            <PresetFieldToggle
              label={t("managers.presets.strokeColorLabel")}
              value={background.strokeColor}
              defaultValue={DEFAULT_BACKGROUND.strokeColor}
              onChange={(v) => onBackgroundChange("strokeColor", v)}
            >
              {(v, set) => <input type="color" value={v} onChange={(e) => set(e.target.value)} />}
            </PresetFieldToggle>
          </div>

          <PresetFieldToggle
            label={t("managers.presets.strokeWidthLabel")}
            value={background.strokeWidthPx}
            defaultValue={DEFAULT_BACKGROUND.strokeWidthPx}
            onChange={(v) => onBackgroundChange("strokeWidthPx", v)}
          >
            {(v, set) => <input type="number" min={0} value={v} onChange={(e) => set(Number(e.target.value))} />}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.strokeDashLabel")}
            value={background.strokeDashPattern}
            defaultValue={DEFAULT_BACKGROUND.strokeDashPattern}
            onChange={(v) => onBackgroundChange("strokeDashPattern", v)}
          >
            {(v, set) => (
              <div className="field-row" style={{ flexWrap: "wrap" }}>
                <select
                  value={matchDashPreset(v)}
                  onChange={(e) => {
                    const preset = DASH_PRESETS.find((p) => p.id === e.target.value);
                    if (preset) set(preset.pattern);
                  }}
                >
                  <option value="solid">{t("managers.presets.strokeDashSolid")}</option>
                  <option value="dotted">{t("managers.presets.strokeDashDotted")}</option>
                  <option value="dashed">{t("managers.presets.strokeDashDashed")}</option>
                  <option value="dashDot">{t("managers.presets.strokeDashDashDot")}</option>
                  <option value="longDash">{t("managers.presets.strokeDashLongDash")}</option>
                  <option value="custom">{t("managers.presets.strokeDashCustom")}</option>
                </select>
                <input type="text" value={formatDashPattern(v)} onChange={(e) => set(parseDashPattern(e.target.value))} />
              </div>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("editor.textEffects.strokeDashOffsetLabel")}
            value={background.strokeDashOffsetPx}
            defaultValue={DEFAULT_BACKGROUND.strokeDashOffsetPx}
            onChange={(v) => onBackgroundChange("strokeDashOffsetPx", v)}
          >
            {(v, set) => <input type="number" value={v} onChange={(e) => set(Number(e.target.value))} />}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.paddingRatioLabel")}
            value={background.paddingRatio}
            defaultValue={DEFAULT_BACKGROUND.paddingRatio}
            onChange={(v) => onBackgroundChange("paddingRatio", v)}
          >
            {(v, set) => (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={0} max={90} value={Math.round(v * 100)} onChange={(e) => set(Number(e.target.value) / 100)} style={{ flex: 1 }} />
                <span className="hint">{Math.round(v * 100)}%</span>
              </div>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.tailStyleLabel")}
            value={background.tailStyle}
            defaultValue={DEFAULT_BACKGROUND.tailStyle}
            onChange={(v) => onBackgroundChange("tailStyle", v)}
          >
            {(v, set) => (
              <select value={v} onChange={(e) => set(e.target.value as TailStyle)}>
                <option value="point">{t("managers.presets.tailStylePoint")}</option>
                <option value="point-detached">{t("managers.presets.tailStylePointDetached")}</option>
                <option value="chain">{t("managers.presets.tailStyleChain")}</option>
              </select>
            )}
          </PresetFieldToggle>

          {showTailChain && (
            <>
              <PresetFieldToggle
                label={t("managers.presets.segmentShapeLabel")}
                value={background.tailChainSegmentShape}
                defaultValue={DEFAULT_BACKGROUND.tailChainSegmentShape}
                onChange={(v) => onBackgroundChange("tailChainSegmentShape", v)}
              >
                {(v, set) => (
                  <select value={v} onChange={(e) => set(e.target.value as TailChainSegmentShape)}>
                    <option value="circle">{t("managers.presets.segmentShapeCircle")}</option>
                    <option value="rect">{t("managers.presets.segmentShapeRect")}</option>
                    <option value="diamond">{t("managers.presets.segmentShapeDiamond")}</option>
                  </select>
                )}
              </PresetFieldToggle>
              <PresetFieldToggle
                label={t("managers.presets.segmentsCountLabel")}
                value={background.tailChainSegments}
                defaultValue={DEFAULT_BACKGROUND.tailChainSegments}
                onChange={(v) => onBackgroundChange("tailChainSegments", v)}
              >
                {(v, set) => <input type="number" min={1} max={8} value={v} onChange={(e) => set(Number(e.target.value))} />}
              </PresetFieldToggle>
              <PresetFieldToggle
                label={t("managers.presets.segmentSpacingLabel")}
                value={background.tailChainSpacing}
                defaultValue={DEFAULT_BACKGROUND.tailChainSpacing}
                onChange={(v) => onBackgroundChange("tailChainSpacing", v)}
              >
                {(v, set) => <input type="number" step={0.1} min={0.1} value={v} onChange={(e) => set(Number(e.target.value))} />}
              </PresetFieldToggle>
            </>
          )}
        </>
      )}

      {activeTab === "backgroundEffects" && (
        <>
          <PresetFieldToggle
            label={t("managers.presets.backgroundGradientFillLabel")}
            value={background.backgroundGradientFill}
            defaultValue={DEFAULT_BACKGROUND.backgroundGradientFill}
            onChange={(v) => onBackgroundChange("backgroundGradientFill", v)}
          >
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row">
                  <input type="color" value={v.colorStart} onChange={(e) => set({ ...v, colorStart: e.target.value })} />
                  <input type="color" value={v.colorEnd} onChange={(e) => set({ ...v, colorEnd: e.target.value })} />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.backgroundScreentoneLabel")}
            value={background.backgroundScreentone}
            defaultValue={DEFAULT_BACKGROUND.backgroundScreentone}
            onChange={(v) => onBackgroundChange("backgroundScreentone", v)}
          >
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row" style={{ flexWrap: "wrap" }}>
                  <select value={v.pattern} onChange={(e) => set({ ...v, pattern: e.target.value as BubbleScreentonePattern })}>
                    <option value="dots">{t("editor.textEffects.screentonePatternDots")}</option>
                    <option value="lines">{t("editor.textEffects.screentonePatternLines")}</option>
                    <option value="crosshatch">{t("editor.textEffects.screentonePatternCrosshatch")}</option>
                  </select>
                  <input type="number" min={1} value={v.spacingPx} onChange={(e) => set({ ...v, spacingPx: Number(e.target.value) })} />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.sizeRatio}
                    onChange={(e) => set({ ...v, sizeRatio: Number(e.target.value) })}
                  />
                  <input type="number" step={5} value={v.angleDeg} onChange={(e) => set({ ...v, angleDeg: Number(e.target.value) })} />
                  <input type="color" value={v.dotColor} onChange={(e) => set({ ...v, dotColor: e.target.value })} />
                  <input type="color" value={v.backgroundColor} onChange={(e) => set({ ...v, backgroundColor: e.target.value })} />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.opacity}
                    onChange={(e) => set({ ...v, opacity: Number(e.target.value) })}
                  />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.backgroundGlowLabel")}
            value={background.backgroundGlow}
            defaultValue={DEFAULT_BACKGROUND.backgroundGlow}
            onChange={(v) => onBackgroundChange("backgroundGlow", v)}
          >
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row">
                  <input type="color" value={v.color} onChange={(e) => set({ ...v, color: e.target.value })} />
                  <input type="number" min={0} value={v.blurPx} onChange={(e) => set({ ...v, blurPx: Number(e.target.value) })} />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.backgroundDropShadowLabel")}
            value={background.backgroundDropShadow}
            defaultValue={DEFAULT_BACKGROUND.backgroundDropShadow}
            onChange={(v) => onBackgroundChange("backgroundDropShadow", v)}
          >
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row" style={{ flexWrap: "wrap" }}>
                  <input type="color" value={v.color} onChange={(e) => set({ ...v, color: e.target.value })} />
                  <input type="number" min={0} value={v.blurPx} onChange={(e) => set({ ...v, blurPx: Number(e.target.value) })} />
                  <input type="number" value={v.offsetXPx} onChange={(e) => set({ ...v, offsetXPx: Number(e.target.value) })} />
                  <input type="number" value={v.offsetYPx} onChange={(e) => set({ ...v, offsetYPx: Number(e.target.value) })} />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>

          <PresetFieldToggle
            label={t("managers.presets.backgroundBevelLabel")}
            value={background.backgroundBevel}
            defaultValue={DEFAULT_BACKGROUND.backgroundBevel}
            onChange={(v) => onBackgroundChange("backgroundBevel", v)}
          >
            {(v, set) => (
              <OptionalToggleField label={t("managers.presets.onLabel")} checked={v.enabled} onToggle={(enabled) => set({ ...v, enabled })}>
                <div className="field-row" style={{ flexWrap: "wrap" }}>
                  <select value={v.style} onChange={(e) => set({ ...v, style: e.target.value as BubbleBevelStyle })}>
                    <option value="inner">{t("managers.presets.bevelStyleInner")}</option>
                    <option value="outer">{t("managers.presets.bevelStyleOuter")}</option>
                    <option value="emboss">{t("managers.presets.bevelStyleEmboss")}</option>
                  </select>
                  <select value={v.direction} onChange={(e) => set({ ...v, direction: e.target.value as BubbleBevelDirection })}>
                    <option value="up">{t("managers.presets.bevelDirectionUp")}</option>
                    <option value="down">{t("managers.presets.bevelDirectionDown")}</option>
                  </select>
                  <input type="number" min={0} value={v.sizePx} onChange={(e) => set({ ...v, sizePx: Number(e.target.value) })} />
                  <input type="number" step={5} value={v.angleDeg} onChange={(e) => set({ ...v, angleDeg: Number(e.target.value) })} />
                  <input type="number" min={0} value={v.softenPx} onChange={(e) => set({ ...v, softenPx: Number(e.target.value) })} />
                  <input type="color" value={v.highlightColor} onChange={(e) => set({ ...v, highlightColor: e.target.value })} />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.highlightOpacity}
                    onChange={(e) => set({ ...v, highlightOpacity: Number(e.target.value) })}
                  />
                  <input type="color" value={v.shadowColor} onChange={(e) => set({ ...v, shadowColor: e.target.value })} />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={v.shadowOpacity}
                    onChange={(e) => set({ ...v, shadowOpacity: Number(e.target.value) })}
                  />
                </div>
              </OptionalToggleField>
            )}
          </PresetFieldToggle>
        </>
      )}
    </div>
  );
}
