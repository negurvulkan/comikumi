import type { LanguageDef } from "../../../shared/src/languages";
import { LanguageManager } from "./LanguageManager";

interface Props {
  languages: LanguageDef[];
  active: string;
  onChange: (code: string) => void;
  onLanguagesChange: (languages: LanguageDef[]) => void;
}

/** Vertical main-language switcher, docked directly right of the (collapsible) text
 * sidebar — a flex sibling, so it slides right automatically as the sidebar's width
 * animates open, with no manual position syncing. Replaces the old horizontal
 * LanguageTabs as the primary page-language switcher; TextListPanel keeps its own
 * independent selector for browsing a different language than the one being edited. */
export function LanguageStrip({ languages, active, onChange, onLanguagesChange }: Props) {
  return (
    <div className="langstrip">
      {languages.map((l) => (
        <button
          key={l.code}
          className={`lang-chip${l.code === active ? " active" : ""}`}
          onClick={() => onChange(l.code)}
          title={l.label}
        >
          {l.code.toUpperCase()}
        </button>
      ))}
      <LanguageManager languages={languages} onChange={onLanguagesChange} compact />
    </div>
  );
}
