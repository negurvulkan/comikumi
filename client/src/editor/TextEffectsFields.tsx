import type { TextGradient, TextOutline } from "../../../shared/src/layoutSchema";
import { ScopeSwitch } from "./ScopeSwitch";

interface Props {
  color: string;
  onColorChange: (value: string) => void;
  outline: TextOutline;
  onOutlineChange: (patch: Partial<TextOutline>) => void;
  gradient: TextGradient;
  onGradientChange: (patch: Partial<TextGradient>) => void;
  activeLanguage: string;
  hasLanguageOverride: boolean;
  onToggleLanguageOverride: (checked: boolean) => void;
  /** True when a linked preset governs color/outline/gradient and no language override
   * is active for them — inputs still show the preset's resolved value but can't be
   * edited directly (see BubbleInspector.tsx/CurvedTextInspector.tsx's "Preset"-Zeile). */
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
  activeLanguage,
  hasLanguageOverride,
  onToggleLanguageOverride,
  disabled,
}: Props) {
  return (
    <>
      <label>
        Farbe
        <input type="color" value={color} onChange={(e) => onColorChange(e.target.value)} disabled={disabled} />
      </label>
      {disabled && (
        <p className="hint" style={{ margin: "-4px 0 8px" }}>
          Von Preset vorgegeben.
        </p>
      )}
      {gradient.enabled && (
        <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
          Wird durch den Farbverlauf unten ersetzt, solange dieser aktiv ist.
        </p>
      )}

      <div className="field-label-row">
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Umrandung &amp; Farbverlauf</span>
        <ScopeSwitch
          activeLanguage={activeLanguage}
          scope={hasLanguageOverride ? "language" : "all"}
          onChange={(s) => onToggleLanguageOverride(s === "language")}
        />
      </div>

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={outline.enabled} onChange={(e) => onOutlineChange({ enabled: e.target.checked })} disabled={disabled} />
        Textumrandung
      </label>
      {outline.enabled && (
        <div className="field-row">
          <label>
            Randfarbe (Text)
            <input type="color" value={outline.color} onChange={(e) => onOutlineChange({ color: e.target.value })} disabled={disabled} />
          </label>
          <label>
            Randbreite (Text)
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
        Farbverlauf
      </label>
      {gradient.enabled && (
        <div className="field-row">
          <label>
            Startfarbe
            <input type="color" value={gradient.colorStart} onChange={(e) => onGradientChange({ colorStart: e.target.value })} disabled={disabled} />
          </label>
          <label>
            Endfarbe
            <input type="color" value={gradient.colorEnd} onChange={(e) => onGradientChange({ colorEnd: e.target.value })} disabled={disabled} />
          </label>
          <label>
            Winkel (°)
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
    </>
  );
}
