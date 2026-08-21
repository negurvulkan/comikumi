import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import type { Character } from "../../../shared/src/characters";

interface Props {
  characters: Character[];
  onChange: (characters: Character[]) => void;
  /** Omitted when this ever needs to be embedded somewhere without a close affordance. */
  onClose?: () => void;
}

/** Projectwide cast list, editable from the "Projekt"-menu on every screen (Editor,
 * Seitenübersicht, Bandliste) — same CRUD-in-a-Modal shape as SettingsForm.tsx, reusing
 * LanguageManager's list/form CSS classes (they're generic popover-list styling, not
 * actually language-specific). Includes a "Voice Notes" free-text field (personality/
 * speech patterns, for translators) and inline editing — added alongside Voice Notes
 * since that's a field you revise over time, not just set once at creation. */
export function CharacterManager({ characters, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6c8cff");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setName("");
    setColor("#6c8cff");
    setVoiceNotes("");
    setEditingId(null);
  }

  function startEdit(c: Character) {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color);
    setVoiceNotes(c.voiceNotes);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { name: name.trim(), color, voiceNotes };
      const next = editingId ? await api.updateCharacter(editingId, payload) : await api.addCharacter(payload);
      onChange(next);
      resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("managers.characters.confirmDelete"))) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.deleteCharacter(id);
      onChange(next);
      if (editingId === id) resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 380 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("managers.characters.title")}</p>

      <div className="language-manager-list">
        {characters.map((c) => (
          <div key={c.id} className="language-manager-row">
            <button
              type="button"
              onClick={() => startEdit(c)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
              title={t("common.edit")}
            >
              <span
                style={{ width: 12, height: 12, borderRadius: "50%", background: c.color, display: "inline-block", flexShrink: 0 }}
              />
              {c.name}
            </button>
            <button onClick={() => handleDelete(c.id)} disabled={busy} title={t("managers.characters.remove")}>
              ×
            </button>
          </div>
        ))}
        {characters.length === 0 && <p className="hint">{t("managers.characters.empty")}</p>}
      </div>

      <form onSubmit={handleSubmit} className="language-manager-form">
        <label>
          {t("managers.characters.nameLabel")}
          <input placeholder={t("managers.characters.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t("managers.characters.colorLabel")}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label>
          {t("managers.characters.voiceNotesLabel")}
          <textarea
            placeholder={t("managers.characters.voiceNotesPlaceholder")}
            value={voiceNotes}
            onChange={(e) => setVoiceNotes(e.target.value)}
            style={{ minHeight: 60 }}
          />
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
