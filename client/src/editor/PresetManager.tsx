import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { BUILTIN_PRESETS, type LetteringPreset, type PresetTextFields, type PresetBackgroundFields } from "../../../shared/src/presets";
import { useConfirmDialog } from "./ConfirmDialog";
import { PresetList } from "./PresetList";
import { PresetPropertiesPanel } from "./PresetPropertiesPanel";
import { PresetPreview } from "./PresetPreview";

interface Props {
  presets: LetteringPreset[];
  onChange: (presets: LetteringPreset[]) => void;
  onClose?: () => void;
}

interface Form {
  name: string;
  text: PresetTextFields;
  background: PresetBackgroundFields;
}

function emptyForm(): Form {
  return { name: "", text: {}, background: {} };
}

/** Projectwide, live-linked style presets — editable from the "Projekt"-menu on every
 * screen. Each field is individually toggle-able (sparse): only checked fields are part
 * of the saved preset and live-drive every Bubble/CurvedTextElement linked to it via
 * presetId (see resolveBubbleStyle/resolveBubbleForm/resolveCurvedTextStyle).
 *
 * Orchestrator only — list/selection state, the shared `form` buffer, network calls, and
 * a dirty-check guard live here; the 3-column layout itself is PresetList (left) +
 * PresetPropertiesPanel (middle) + PresetPreview (right). */
export function PresetManager({ presets, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [form, setForm] = useState<Form>(emptyForm());
  const [baseline, setBaseline] = useState<Form>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  function loadForEdit(p: LetteringPreset) {
    const next = { name: p.name, text: p.text, background: p.background };
    setEditingId(p.id);
    setForm(next);
    setBaseline(next);
  }

  function resetForm() {
    const next = emptyForm();
    setForm(next);
    setBaseline(next);
    setEditingId(null);
  }

  /** Guards any action that would discard the current `form` buffer (switching to a
   * different preset, starting a fresh draft, or closing) behind a confirm prompt when
   * there are unsaved edits — fixes a real gap in the previous single-column UI, where
   * clicking a different preset's name silently threw away whatever was being edited. */
  async function guardDiscard(next: () => void) {
    if (!dirty) {
      next();
      return;
    }
    if (await confirm({ message: t("managers.presets.unsavedChangesConfirmMessage") })) next();
  }

  function setText<K extends keyof PresetTextFields>(key: K, value: PresetTextFields[K] | undefined) {
    setForm((f) => ({ ...f, text: { ...f.text, [key]: value } }));
  }

  function setBackground<K extends keyof PresetBackgroundFields>(key: K, value: PresetBackgroundFields[K] | undefined) {
    setForm((f) => ({ ...f, background: { ...f.background, [key]: value } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { name: form.name.trim(), text: form.text, background: form.background };
      const next = editingId ? await api.updatePreset(editingId, payload) : await api.addPreset(payload);
      onChange(next);
      resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFromLibrary(builtin: (typeof BUILTIN_PRESETS)[number]) {
    setError(null);
    setBusy(true);
    try {
      const next = await api.addPreset(builtin);
      onChange(next);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ message: t("managers.presets.confirmDelete"), danger: true, confirmLabel: t("common.delete") }))) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.deletePreset(id);
      onChange(next);
      if (editingId === id) resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector preset-manager-root" style={{ width: "min(1180px, 95vw)", maxHeight: "85vh", overflowY: "auto" }}>
      {confirmDialog}
      <p style={{ margin: 0, fontWeight: 600 }}>{t("managers.presets.title")}</p>

      <div className="preset-manager-layout">
        <PresetList
          presets={presets}
          selectedId={editingId}
          onSelect={(id) => guardDiscard(() => loadForEdit(presets.find((p) => p.id === id)!))}
          onCreate={() => guardDiscard(resetForm)}
          onDelete={handleDelete}
          onAddFromLibrary={handleAddFromLibrary}
          busy={busy}
        />
        <PresetPropertiesPanel text={form.text} background={form.background} onTextChange={setText} onBackgroundChange={setBackground} />
        <PresetPreview text={form.text} background={form.background} />
      </div>

      <form onSubmit={handleSubmit} className="language-manager-form" style={{ marginTop: 8 }}>
        <label>
          {t("managers.characters.nameLabel")}
          <input
            placeholder={t("managers.presets.namePlaceholder")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "…" : editingId ? t("common.save") : t("common.add")}
          </button>
          {editingId && (
            <button type="button" onClick={() => guardDiscard(resetForm)} disabled={busy}>
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
      {error && <div className="language-manager-error">{error}</div>}

      {onClose && (
        <button type="button" onClick={() => guardDiscard(onClose)} style={{ marginTop: 8 }}>
          {t("common.close")}
        </button>
      )}
    </div>
  );
}
