import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useConfirmDialog } from "./ConfirmDialog";
import type { Tag } from "../../../shared/src/tags";
import type { LetteringPreset } from "../../../shared/src/presets";

interface Props {
  tags: Tag[];
  onChange: (tags: Tag[]) => void;
  /** Project presets — the targets the volume-wide tag restyle can assign. */
  presets: LetteringPreset[];
  /** Volume whose saved pages the tag-restyle action operates on (the editor/overview the
   * manager was opened from). When omitted, the restyle section is hidden. */
  restyleVolumeId?: string;
  /** Translator+ may edit the tag list (editorial classification). */
  canManage: boolean;
  /** Letterer+ may run the volume-wide restyle (it changes style). */
  canRestyle: boolean;
  onClose?: () => void;
}

/** Projectwide semantic tag list (see shared/src/tags.ts), plus the volume-wide
 * tag-based bulk restyle — "assign this preset to every element tagged X across the
 * volume" in one step. Same CRUD-in-a-modal shape as CharacterManager.tsx. */
export function TagManager({ tags, onChange, presets, restyleVolumeId, canManage, canRestyle, onClose }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6c8cff");
  const [excludeFromQa, setExcludeFromQa] = useState(false);
  const [requiresCharacter, setRequiresCharacter] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Volume-wide restyle form state.
  const [restyleTagId, setRestyleTagId] = useState("");
  const [restylePresetId, setRestylePresetId] = useState("");
  const [restyleBusy, setRestyleBusy] = useState(false);
  const [restyleResult, setRestyleResult] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setColor("#6c8cff");
    setExcludeFromQa(false);
    setRequiresCharacter(false);
    setEditingId(null);
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color);
    setExcludeFromQa(tag.excludeFromQa);
    setRequiresCharacter(tag.requiresCharacter);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { name: name.trim(), color, excludeFromQa, requiresCharacter };
      const next = editingId ? await api.updateTag(editingId, payload) : await api.addTag(payload);
      onChange(next);
      resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ message: t("managers.tags.confirmDelete"), danger: true, confirmLabel: t("common.delete") }))) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.deleteTag(id);
      onChange(next);
      if (editingId === id) resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestyle() {
    if (!restyleVolumeId || !restyleTagId) return;
    setError(null);
    setRestyleResult(null);
    setRestyleBusy(true);
    try {
      const res = await api.restyleByTag(restyleVolumeId, restyleTagId, restylePresetId || null);
      setRestyleResult(t("managers.tags.restyleResult", { elements: res.elementsChanged, pages: res.pagesChanged }));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setRestyleBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 380 }}>
      {confirmDialog}
      <p style={{ margin: 0, fontWeight: 600 }}>{t("managers.tags.title")}</p>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        {t("managers.tags.description")}
      </p>

      <div className="language-manager-list">
        {tags.map((tag) => (
          <div key={tag.id} className="language-manager-row">
            <button
              type="button"
              onClick={() => canManage && startEdit(tag)}
              disabled={!canManage}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: canManage ? "pointer" : "default", color: "inherit" }}
              title={canManage ? t("common.edit") : undefined}
            >
              <span style={{ width: 12, height: 12, borderRadius: 3, background: tag.color, display: "inline-block", flexShrink: 0 }} />
              {tag.name}
            </button>
            {canManage && (
              <button onClick={() => handleDelete(tag.id)} disabled={busy} title={t("common.delete")}>
                ×
              </button>
            )}
          </div>
        ))}
        {tags.length === 0 && <p className="hint">{t("managers.tags.empty")}</p>}
      </div>

      {canManage && (
        <form onSubmit={handleSubmit} className="language-manager-form">
          <label>
            {t("managers.tags.nameLabel")}
            <input placeholder={t("managers.tags.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            {t("managers.tags.colorLabel")}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={excludeFromQa} onChange={(e) => setExcludeFromQa(e.target.checked)} />
            {t("managers.tags.excludeFromQaLabel")}
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={requiresCharacter} onChange={(e) => setRequiresCharacter(e.target.checked)} />
            {t("managers.tags.requiresCharacterLabel")}
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
      )}

      {restyleVolumeId && canRestyle && tags.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border, #333)", paddingTop: 10 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{t("managers.tags.restyleTitle")}</p>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            {t("managers.tags.restyleDescription")}
          </p>
          <label>
            {t("managers.tags.restyleTagLabel")}
            <select value={restyleTagId} onChange={(e) => setRestyleTagId(e.target.value)}>
              <option value="">{t("managers.tags.restyleTagPlaceholder")}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("managers.tags.restylePresetLabel")}
            <select value={restylePresetId} onChange={(e) => setRestylePresetId(e.target.value)}>
              <option value="">{t("managers.tags.restylePresetDetach")}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleRestyle} disabled={restyleBusy || !restyleTagId}>
            {restyleBusy ? "…" : t("managers.tags.restyleApply")}
          </button>
          {restyleResult && (
            <p className="hint" style={{ margin: "6px 0 0", color: "var(--text)" }}>
              {restyleResult}
            </p>
          )}
        </div>
      )}

      {error && <div className="language-manager-error">{error}</div>}

      {onClose && (
        <button type="button" onClick={onClose} style={{ marginTop: 8 }}>
          {t("common.close")}
        </button>
      )}
    </div>
  );
}
