import { useState } from "react";
import { api } from "../api/client";
import type { LanguageDef } from "../../../shared/src/languages";

interface Props {
  languages: LanguageDef[];
  onChange: (languages: LanguageDef[]) => void;
  /** Renders the trigger as a small "+" chip (for the vertical LanguageStrip) instead
   * of the text-labelled "+ Sprache" button — popover behavior/state is unchanged. */
  compact?: boolean;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function LanguageManager({ languages, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [folderSuffix, setFolderSuffix] = useState("");
  const [folderSuffixTouched, setFolderSuffixTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setCode("");
    setLabel("");
    setFolderSuffix("");
    setFolderSuffixTouched(false);
  }

  function handleLabelChange(value: string) {
    setLabel(value);
    if (!folderSuffixTouched) setFolderSuffix(slugify(value));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const next = await api.addLanguage({
        code: code.trim(),
        label: label.trim(),
        folderSuffix: folderSuffix.trim() || slugify(code),
      });
      onChange(next);
      resetForm();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(langCode: string) {
    if (!confirm(`Sprache "${langCode}" aus der Liste entfernen? Bereits übersetzte Texte bleiben in den JSON-Dateien erhalten.`)) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.deleteLanguage(langCode);
      onChange(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="language-manager">
      <button
        onClick={() => setOpen((o) => !o)}
        className={compact ? `lang-chip add${open ? " active" : ""}` : open ? "active" : ""}
        title="Sprachen verwalten"
      >
        {compact ? "+" : "+ Sprache"}
      </button>
      {open && (
        <div className="language-manager-panel">
          <div className="language-manager-list">
            {languages.map((l) => (
              <div key={l.code} className="language-manager-row">
                <span>
                  {l.label} <em>({l.code})</em> — Ordner-Suffix: <code>{l.folderSuffix}</code>
                </span>
                <button onClick={() => handleDelete(l.code)} disabled={busy} title="Sprache entfernen">
                  ×
                </button>
              </div>
            ))}
            {languages.length === 0 && <p className="hint">Noch keine Sprachen angelegt.</p>}
          </div>
          <form onSubmit={handleAdd} className="language-manager-form">
            <label>
              Name
              <input
                placeholder="z. B. Français"
                value={label}
                onChange={(e) => handleLabelChange(e.target.value)}
                required
              />
            </label>
            <label>
              Code
              <input placeholder="z. B. fr" value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <label>
              Ordner-Suffix
              <input
                placeholder="z. B. french"
                value={folderSuffix}
                onChange={(e) => {
                  setFolderSuffixTouched(true);
                  setFolderSuffix(e.target.value);
                }}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "…" : "Hinzufügen"}
            </button>
          </form>
          {error && <div className="language-manager-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
