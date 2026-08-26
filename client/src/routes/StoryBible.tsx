import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type ImageEntry } from "../api/client";
import type { Entity, EntityRelation } from "../../../shared/src/entities";
import { translateApiError } from "../i18n/translateApiError";
import { useConfirmDialog } from "../editor/ConfirmDialog";
import { useProjectRole } from "../state/useProjectRole";

const DEFAULT_TYPE_SUGGESTIONS = ["character", "location", "item", "faction"];

/** Generic worldbuilding/story-bible screen: a projectwide list of entities (characters,
 * locations, items, factions, ...) with a reference-image gallery and relations between
 * entries. `type === "character"` entities ARE the same records used for Bubble.characterId
 * tagging (see server/src/lib/projectStore.ts's readCharacters/writeCharacters) — this
 * screen is just a richer view onto the same data, not a separate list. */
export function StoryBible() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const { hasAtLeast } = useProjectRole();
  const canEdit = hasAtLeast("translator");
  const canUploadImages = hasAtLeast("letterer");
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [relations, setRelations] = useState<EntityRelation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [images, setImages] = useState<ImageEntry[] | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("");
  const [formColor, setFormColor] = useState("#6c8cff");
  const [formSummary, setFormSummary] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationLabel, setRelationLabel] = useState("");

  useEffect(() => {
    Promise.all([api.listEntities(), api.listEntityRelations()])
      .then(([e, r]) => {
        setEntities(e);
        setRelations(r);
      })
      .catch((err) => setError(translateApiError(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => entities?.find((e) => e.id === selectedId) ?? null, [entities, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setFormName(selected.name);
    setFormType(selected.type);
    setFormColor(selected.color);
    setFormSummary(selected.summary);
    setFormNotes(selected.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selectedId) {
      setImages(null);
      return;
    }
    api
      .listEntityImages(selectedId)
      .then((listing) => setImages(listing.files))
      .catch((err) => setError(translateApiError(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const typesInUse = useMemo(() => Array.from(new Set((entities ?? []).map((e) => e.type))), [entities]);
  const typeSuggestions = useMemo(
    () => Array.from(new Set([...DEFAULT_TYPE_SUGGESTIONS, ...typesInUse])),
    [typesInUse]
  );
  const visibleEntities = useMemo(
    () => (entities ?? []).filter((e) => !typeFilter || e.type === typeFilter),
    [entities, typeFilter]
  );
  const selectedRelations = useMemo(
    () => (relations ?? []).filter((r) => r.fromId === selectedId || r.toId === selectedId),
    [relations, selectedId]
  );

  function entityName(id: string): string {
    return entities?.find((e) => e.id === id)?.name ?? id;
  }

  async function handleCreateEntity(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.addEntity({ type: newType.trim() || "character", name: newName.trim(), color: "#6c8cff" });
      setEntities(next);
      setSelectedId(next[next.length - 1].id);
      setNewName("");
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEntity(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.updateEntity(selected.id, {
        type: formType.trim() || "character",
        name: formName.trim(),
        color: formColor,
        summary: formSummary,
        notes: formNotes,
      });
      setEntities(next);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntity() {
    if (!selected) return;
    if (!(await confirm({ message: t("storyBible.confirmDelete", { name: selected.name }), danger: true, confirmLabel: t("common.delete") }))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.deleteEntity(selected.id);
      setEntities(next);
      setSelectedId(null);
      setRelations(await api.listEntityRelations());
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadEntityImage(selectedId, file);
      setImages((await api.listEntityImages(selectedId)).files);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteImage(fileName: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteEntityImage(selectedId, fileName);
      setImages((await api.listEntityImages(selectedId)).files);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddRelation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !relationTargetId || !relationLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.addEntityRelation({ fromId: selectedId, toId: relationTargetId, label: relationLabel.trim() });
      setRelations(next);
      setRelationTargetId("");
      setRelationLabel("");
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRelation(id: string) {
    setBusy(true);
    setError(null);
    try {
      setRelations(await api.deleteEntityRelation(id));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-padded" style={{ gap: 12 }}>
      {confirmDialog}
      <Link to={`/p/${encodeURIComponent(projectId)}`} style={{ display: "inline-block" }}>
        {t("storyBible.backLink")}
      </Link>
      <h2 style={{ margin: 0 }}>{t("storyBible.title")}</h2>
      {error && <div className="error-banner">{error}</div>}

      <datalist id="story-bible-type-suggestions">
        {typeSuggestions.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>

      <div style={{ display: "flex", gap: 16, flex: "1 1 auto", minHeight: 0 }}>
        <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button type="button" className={!typeFilter ? "primary" : undefined} onClick={() => setTypeFilter(null)}>
              {t("storyBible.filterAll")}
            </button>
            {typesInUse.map((type) => (
              <button key={type} type="button" className={typeFilter === type ? "primary" : undefined} onClick={() => setTypeFilter(type)}>
                {type}
              </button>
            ))}
          </div>

          <div className="page-scroll" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entities === null && <p>{t("common.loading")}</p>}
            {entities !== null && visibleEntities.length === 0 && <p className="hint">{t("storyBible.empty")}</p>}
            {visibleEntities.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                  padding: "8px 10px",
                  borderColor: selectedId === e.id ? "var(--accent)" : undefined,
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                  <div className="hint" style={{ margin: 0 }}>
                    {e.type}
                  </div>
                </span>
              </button>
            ))}
          </div>

          {canEdit && (
            <form onSubmit={handleCreateEntity} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input placeholder={t("storyBible.namePlaceholder")} value={newName} onChange={(e) => setNewName(e.target.value)} required />
              <input
                list="story-bible-type-suggestions"
                placeholder={t("storyBible.typePlaceholder")}
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              />
              <button type="submit" className="primary" disabled={busy}>
                {t("storyBible.newEntry")}
              </button>
            </form>
          )}
        </div>

        <div className="page-scroll" style={{ flex: "1 1 auto", minHeight: 0 }}>
          {!selected && <p className="hint">{t("storyBible.noSelection")}</p>}
          {selected && (
            <div className="inspector" style={{ maxWidth: 520 }}>
              <form onSubmit={handleSaveEntity} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label>
                  {t("storyBible.nameLabel")}
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} required disabled={!canEdit} />
                </label>
                <label>
                  {t("storyBible.typeLabel")}
                  <input list="story-bible-type-suggestions" value={formType} onChange={(e) => setFormType(e.target.value)} disabled={!canEdit} />
                </label>
                <label>
                  {t("storyBible.colorLabel")}
                  <input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} disabled={!canEdit} />
                </label>
                <label>
                  {t("storyBible.summaryLabel")}
                  <input value={formSummary} onChange={(e) => setFormSummary(e.target.value)} disabled={!canEdit} />
                </label>
                <label>
                  {t("storyBible.notesLabel")}
                  <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} style={{ minHeight: 100 }} disabled={!canEdit} />
                </label>
                {canEdit && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" className="primary" disabled={busy}>
                      {t("common.save")}
                    </button>
                    <button type="button" onClick={handleDeleteEntity} disabled={busy}>
                      {t("storyBible.deleteEntity")}
                    </button>
                  </div>
                )}
              </form>

              <div style={{ marginTop: 20 }}>
                <p style={{ fontWeight: 600 }}>{t("storyBible.galleryHeading")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(images ?? []).map((img) => (
                    <div key={img.fileName} className="card-wrap" style={{ width: 96 }}>
                      <img src={img.url} alt={img.fileName} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 4 }} />
                      {canUploadImages && (
                        <button
                          type="button"
                          className="card-delete-btn"
                          style={{ opacity: 1 }}
                          onClick={() => handleDeleteImage(img.fileName)}
                          title={t("storyBible.deleteImage")}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {images !== null && images.length === 0 && <p className="hint">{t("storyBible.noImages")}</p>}
                </div>
                {canUploadImages && (
                  <label style={{ display: "inline-block", marginTop: 8 }}>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleUploadImage} style={{ display: "none" }} />
                    <span className="button">{t("storyBible.uploadImage")}</span>
                  </label>
                )}
              </div>

              <div style={{ marginTop: 20 }}>
                <p style={{ fontWeight: 600 }}>{t("storyBible.relationsHeading")}</p>
                {selectedRelations.length === 0 && <p className="hint">{t("storyBible.noRelations")}</p>}
                <div className="language-manager-list">
                  {selectedRelations.map((r) => (
                    <div key={r.id} className="language-manager-row">
                      <span>
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.fromId)}
                          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
                        >
                          {entityName(r.fromId)}
                        </button>
                        {` — ${r.label} → `}
                        <button
                          type="button"
                          onClick={() => setSelectedId(r.toId)}
                          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
                        >
                          {entityName(r.toId)}
                        </button>
                      </span>
                      {canEdit && (
                        <button type="button" onClick={() => handleDeleteRelation(r.id)} title={t("storyBible.deleteRelation")}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <form onSubmit={handleAddRelation} style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <select value={relationTargetId} onChange={(e) => setRelationTargetId(e.target.value)} required>
                      <option value="">{t("storyBible.relationToLabel")}</option>
                      {(entities ?? [])
                        .filter((e) => e.id !== selected.id)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                    </select>
                    <input
                      placeholder={t("storyBible.relationLabelPlaceholder")}
                      value={relationLabel}
                      onChange={(e) => setRelationLabel(e.target.value)}
                      required
                    />
                    <button type="submit" disabled={busy}>
                      {t("storyBible.addRelation")}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
