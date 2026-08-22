import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useConfirmDialog } from "./ConfirmDialog";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LanguageDef } from "../../../shared/src/languages";

interface Props {
  glossary: GlossaryEntry[];
  languages: LanguageDef[];
  onChange: (glossary: GlossaryEntry[]) => void;
  onClose?: () => void;
}

function emptyTranslations(languages: LanguageDef[]): Record<string, string> {
  return Object.fromEntries(languages.map((l) => [l.code, ""]));
}

/** Projectwide term list, editable from the "Projekt"-menu on every screen — same
 * add/edit-in-place/delete shape as CharacterManager.tsx, except an entry carries one
 * translation per language (like Bubble.text) instead of a single name. The approved
 * translations feed BubbleInspector's/CurvedTextInspector's glossary highlighting. */
export function GlossaryManager({ glossary, languages, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [term, setTerm] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>(emptyTranslations(languages));
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setTerm("");
    setTranslations(emptyTranslations(languages));
    setNote("");
    setEditingId(null);
  }

  function startEdit(entry: GlossaryEntry) {
    setEditingId(entry.id);
    setTerm(entry.term);
    setTranslations({ ...emptyTranslations(languages), ...entry.translations });
    setNote(entry.note);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { term: term.trim(), translations, note };
      const next = editingId ? await api.updateGlossaryEntry(editingId, payload) : await api.addGlossaryEntry(payload);
      onChange(next);
      resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ message: t("managers.glossary.confirmDelete"), danger: true, confirmLabel: t("common.delete") }))) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.deleteGlossaryEntry(id);
      onChange(next);
      if (editingId === id) resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 420 }}>
      {confirmDialog}
      <p style={{ margin: 0, fontWeight: 600 }}>{t("managers.glossary.title")}</p>

      <div className="language-manager-list">
        {glossary.map((entry) => (
          <div key={entry.id} className="language-manager-row">
            <button
              type="button"
              onClick={() => startEdit(entry)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}
              title={t("common.edit")}
            >
              {entry.term}
              {languages.length > 0 && entry.translations[languages[0].code] && (
                <span className="hint"> — {entry.translations[languages[0].code]}</span>
              )}
            </button>
            <button onClick={() => handleDelete(entry.id)} disabled={busy} title={t("managers.glossary.remove")}>
              ×
            </button>
          </div>
        ))}
        {glossary.length === 0 && <p className="hint">{t("managers.glossary.empty")}</p>}
      </div>

      <form onSubmit={handleSubmit} className="language-manager-form">
        <label>
          {t("managers.glossary.termLabel")}
          <input placeholder={t("managers.glossary.termPlaceholder")} value={term} onChange={(e) => setTerm(e.target.value)} required />
        </label>
        {languages.map((l) => (
          <label key={l.code}>
            {t("managers.glossary.translationLabel", { language: l.label })}
            <input
              value={translations[l.code] ?? ""}
              onChange={(e) => setTranslations((t) => ({ ...t, [l.code]: e.target.value }))}
            />
          </label>
        ))}
        <label>
          {t("managers.glossary.noteLabel")}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 50 }} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "…" : editingId ? t("common.save") : t("common.add")}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} disabled={busy}>
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
      {error && <div className="language-manager-error">{error}</div>}

      {onClose && (
        <button type="button" onClick={onClose}>
          {t("common.close")}
        </button>
      )}
    </div>
  );
}
