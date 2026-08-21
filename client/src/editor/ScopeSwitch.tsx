interface Props {
  activeLanguage: string;
  scope: "all" | "language";
  onChange: (scope: "all" | "language") => void;
}

/** Compact two-state toggle placed directly next to an overridable field's label —
 * "Alle" writes to the shared base value, the language code writes to that language's
 * override. Replaces a checkbox + a second duplicate field with one field whose value
 * source this switch decides; the toggleXOverride(checked) handlers underneath are
 * unchanged, only the control calling them changed shape. */
export function ScopeSwitch({ activeLanguage, scope, onChange }: Props) {
  return (
    <div className="scope-switch">
      <button
        type="button"
        className={scope === "all" ? "active" : ""}
        onClick={() => onChange("all")}
        title="Gilt für alle Sprachen"
      >
        Alle
      </button>
      <button
        type="button"
        className={scope === "language" ? "active" : ""}
        onClick={() => onChange("language")}
        title={`Gilt nur für „${activeLanguage}"`}
      >
        {activeLanguage.toUpperCase()}
      </button>
    </div>
  );
}
