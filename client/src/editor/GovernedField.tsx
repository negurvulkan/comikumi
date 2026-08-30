import type { ReactNode } from "react";

interface Props {
  label: string;
  /** True when a linked preset currently fixes this field's value (see
   * backgroundPresetGoverns/textPresetGoverns in BubbleInspector.tsx/CurvedTextInspector.tsx)
   * — shows the 🔒 badge and is expected to also drive the child input's own `disabled`. */
  governed?: boolean;
  /** Tooltip/aria text for the 🔒 badge — required whenever `governed` can be true. */
  lockTitle?: string;
  /** Rendered next to the label, before the lock badge — typically a ScopeSwitch. */
  extra?: ReactNode;
  children: ReactNode;
}

/** A `<label>` + field-label-row + optional ScopeSwitch + optional preset-lock badge,
 * wrapping a single input/select. Centralizes the "label row with a governed-by-preset
 * indicator" shape that BubbleInspector.tsx and CurvedTextInspector.tsx previously
 * hand-wrote per field (~15 near-identical copies in BubbleInspector.tsx alone) — a new
 * field now only needs its own `<input>`/`<select>`, not the surrounding boilerplate. */
export function GovernedField({ label, governed, lockTitle, extra, children }: Props) {
  return (
    <label>
      <span className="field-label-row">
        {label}
        {extra}
        {governed && (
          <span className="preset-lock" title={lockTitle}>
            🔒
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
