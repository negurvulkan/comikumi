import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return (
    <div className="scope-switch">
      <button
        type="button"
        className={scope === "all" ? "active" : ""}
        onClick={() => onChange("all")}
        title={t("editor.scopeSwitch.allLanguagesTitle")}
      >
        {t("editor.scopeSwitch.all")}
      </button>
      <button
        type="button"
        className={scope === "language" ? "active" : ""}
        onClick={() => onChange("language")}
        title={t("editor.scopeSwitch.onlyLanguageTitle", { language: activeLanguage })}
      >
        {activeLanguage.toUpperCase()}
      </button>
    </div>
  );
}
