import type { ReactNode } from "react";

interface Props<T> {
  label: string;
  /** Sparse: `undefined` means "not part of this preset, every linked bubble/curved
   * text keeps its own value" — matches PresetTextFields/PresetBackgroundFields'
   * all-`.optional()` shape (shared/src/presets.ts) exactly, this isn't cosmetic. */
  value: T | undefined;
  defaultValue: T;
  onChange: (value: T | undefined) => void;
  children: (value: T, set: (v: T) => void) => ReactNode;
}

/** The sparse-toggle analog of GovernedField.tsx — same `.field-label-row` visual
 * language (a field wrapped in a label row), but the badge slot is a checkbox deciding
 * whether the preset defines the field AT ALL, not a lock indicator for something else
 * governing it. Checking seeds `defaultValue`; the render-prop `children(value, set)`
 * only renders while active. See PresetPropertiesPanel.tsx for usage. */
export function PresetFieldToggle<T>({ label, value, defaultValue, onChange, children }: Props<T>) {
  const active = value !== undefined;
  return (
    <label>
      <span className="field-label-row">
        <span style={{ flexDirection: "row", alignItems: "center", gap: 8, display: "flex" }}>
          <input type="checkbox" checked={active} onChange={(e) => onChange(e.target.checked ? defaultValue : undefined)} />
          {label}
        </span>
      </span>
      {active && children(value, onChange)}
    </label>
  );
}
