import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useConfirmDialog } from "./ConfirmDialog";
import type { Chapter, PageMetaDocument } from "../../../shared/src/pageMeta";

interface Props {
  volumeId: string;
  meta: PageMetaDocument;
  etag: string | null;
  onChange: (meta: PageMetaDocument, etag: string | null) => void;
  onClose?: () => void;
}

/** Manages the volume's chapter list (add/rename/remove) — same CRUD-in-a-Modal shape
 * as CharacterManager.tsx, except chapters live inside the single pageMeta document
 * rather than having their own dedicated route, so every mutation here PUTs the whole
 * document back (chapters changed, `pages` carried through unchanged). Removing a
 * chapter deliberately doesn't touch pages that reference it — a page's stale
 * chapterId is harmless (see shared/src/pageMeta.ts), it just stops resolving to a name. */
export function ChapterManager({ volumeId, meta, etag, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setName("");
    setEditingId(null);
  }

  function startEdit(c: Chapter) {
    setEditingId(c.id);
    setName(c.name);
  }

  async function persist(nextChapters: Chapter[]) {
    setError(null);
    setBusy(true);
    try {
      const nextMeta: PageMetaDocument = { ...meta, chapters: nextChapters };
      const result = await api.savePageMeta(volumeId, nextMeta, etag ?? undefined);
      if (result.conflict) {
        onChange(result.current, null);
        setError(t("managers.chapters.conflict"));
        return;
      }
      onChange(nextMeta, result.etag);
      resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextChapters = editingId
      ? meta.chapters.map((c) => (c.id === editingId ? { ...c, name: trimmed } : c))
      : [...meta.chapters, { id: crypto.randomUUID(), name: trimmed }];
    await persist(nextChapters);
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ message: t("managers.chapters.confirmDelete"), danger: true, confirmLabel: t("common.delete") }))) return;
    await persist(meta.chapters.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
  }

  return (
    <div className="inspector" style={{ maxWidth: 380 }}>
      {confirmDialog}
      <p style={{ margin: 0, fontWeight: 600 }}>{t("managers.chapters.title")}</p>

      <div className="language-manager-list">
        {meta.chapters.map((c) => (
          <div key={c.id} className="language-manager-row">
            <button
              type="button"
              onClick={() => startEdit(c)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}
              title={t("common.edit")}
            >
              {c.name}
            </button>
            <button onClick={() => handleDelete(c.id)} disabled={busy} title={t("managers.chapters.remove")}>
              ×
            </button>
          </div>
        ))}
        {meta.chapters.length === 0 && <p className="hint">{t("managers.chapters.empty")}</p>}
      </div>

      <form onSubmit={handleSubmit} className="language-manager-form">
        <label>
          {t("managers.chapters.nameLabel")}
          <input placeholder={t("managers.chapters.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
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
