import type { ReactNode } from "react";

interface Props {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
  children?: ReactNode;
}

/** A checkbox that reveals extra field(s) once checked — the shared shape of "tail
 * on/off + tail style", "clip on/off + clip controls", and "custom padding on/off +
 * padding slider" in BubbleInspector.tsx, previously three near-identical hand-rolled
 * copies of the same checkbox/children pattern. */
export function OptionalToggleField({ label, checked, disabled, onToggle, children }: Props) {
  return (
    <>
      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
        {label}
      </label>
      {checked && children}
    </>
  );
}
