import { useTranslation } from "react-i18next";
import { BUILTIN_PRESETS, type LetteringPreset } from "../../../shared/src/presets";

interface Props {
  presets: LetteringPreset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onAddFromLibrary: (builtin: (typeof BUILTIN_PRESETS)[number]) => void;
  busy: boolean;
}

/** Left column of the redesigned PresetManager: the "Preset anlegen" button, the
 * existing-presets list (.text-list/-row(.active), same active-row pattern
 * LayersPanel.tsx already uses for "currently selected"), and the "add from library"
 * builtin-preset row — moved here verbatim from the old single-column PresetManager.tsx,
 * same name-based dedupe/disabled logic. */
export function PresetList({ presets, selectedId, onSelect, onCreate, onDelete, onAddFromLibrary, busy }: Props) {
  const { t } = useTranslation();

  return (
    <div className="inspector preset-list-panel">
      <button type="button" className="primary" onClick={onCreate} disabled={busy}>
        + {t("managers.presets.createButton")}
      </button>

      <div className="text-list">
        {presets.map((p) => (
          <div key={p.id} className={`text-list-row${p.id === selectedId ? " active" : ""}`} onClick={() => onSelect(p.id)} style={{ cursor: "pointer" }}>
            <span className="text-list-content">{p.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
              disabled={busy}
              title={t("managers.presets.remove")}
            >
              ×
            </button>
          </div>
        ))}
        {presets.length === 0 && <p className="hint">{t("managers.presets.empty")}</p>}
      </div>

      <p className="hint" style={{ margin: "8px 0 4px" }}>
        {t("managers.presets.libraryHeading")}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {BUILTIN_PRESETS.map((builtin) => {
          const alreadyAdded = presets.some((p) => p.name === builtin.name);
          return (
            <button
              key={builtin.name}
              type="button"
              disabled={busy || alreadyAdded}
              onClick={() => onAddFromLibrary(builtin)}
              title={alreadyAdded ? t("managers.presets.libraryAlreadyAdded") : undefined}
            >
              {builtin.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
