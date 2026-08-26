import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Entity, EntityRelation } from "../../../shared/src/entities";
import { api, type ImageEntry } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useResizableSidebarWidth } from "./useResizableSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — same convention as
   * every other `.text-sidebar` panel (TextListPanel.tsx, TranslatorContextPanel.tsx). */
  open: boolean;
  onClose: () => void;
}

/** Read-only lookup panel for the Story Bible (client/src/routes/StoryBible.tsx) —
 * deliberately no create/edit/delete here, just a quick reference while lettering
 * (Editor.tsx) or scripting (ScriptEditor.tsx) without leaving the page; a footer link
 * jumps to the full page for actual editing. Always shows the full projectwide entity
 * list (no page/script context filtering) so this one component works identically in
 * both screens with no extra props. */
export function StoryBiblePanel({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId = "" } = useParams();
  const resize = useResizableSidebarWidth();

  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [relations, setRelations] = useState<EntityRelation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imagesById, setImagesById] = useState<Record<string, ImageEntry[]>>({});

  // Refetches every time the panel is opened (not just on mount) — the same entities
  // are also visible/editable from the full Story Bible page or another browser tab,
  // so a stale-forever list would be more confusing than a small refetch cost here.
  useEffect(() => {
    if (!open) return;
    Promise.all([api.listEntities(), api.listEntityRelations()])
      .then(([e, r]) => {
        setEntities(e);
        setRelations(r);
      })
      .catch((err) => setError(translateApiError(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!expandedId || imagesById[expandedId]) return;
    api
      .listEntityImages(expandedId)
      .then((listing) => setImagesById((prev) => ({ ...prev, [expandedId]: listing.files })))
      .catch(() => {
        // A failed thumbnail fetch shouldn't block the rest of the panel — leave the
        // gallery section empty for this entry rather than surfacing a banner error.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  const typesInUse = useMemo(() => Array.from(new Set((entities ?? []).map((e) => e.type))), [entities]);
  const visibleEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entities ?? []).filter((e) => (!typeFilter || e.type === typeFilter) && (!q || e.name.toLowerCase().includes(q)));
  }, [entities, typeFilter, search]);

  function entityName(id: string): string {
    return entities?.find((e) => e.id === id)?.name ?? id;
  }

  function relationsFor(id: string): EntityRelation[] {
    return (relations ?? []).filter((r) => r.fromId === id || r.toId === id);
  }

  return (
    <div className={`text-sidebar${open ? " open" : ""}`} style={{ width: open ? resize.width : undefined }}>
      <SidebarResizeHandle
        dragging={resize.dragging}
        onPointerDown={resize.handlePointerDown}
        onPointerMove={resize.handlePointerMove}
        onPointerUp={resize.handlePointerUp}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.storyBiblePanel.title")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("editor.storyBiblePanel.searchPlaceholder")}
      />
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

      <div className="sidebar-scroll-body">
        {entities === null && <p className="hint">{t("common.loading")}</p>}
        {entities !== null && visibleEntities.length === 0 && <p className="hint">{t("editor.storyBiblePanel.empty")}</p>}
        {visibleEntities.map((entity) => {
          const expanded = expandedId === entity.id;
          return (
            <div key={entity.id}>
              <button
                type="button"
                className="text-list-row"
                onClick={() => setExpandedId(expanded ? null : entity.id)}
                style={{ background: expanded ? "var(--bg)" : undefined }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: entity.color, flexShrink: 0 }} />
                <span className="text-list-type">{entity.type}</span>
                <span className="text-list-content">{entity.name}</span>
              </button>
              {expanded && (
                <div style={{ padding: "4px 8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <p className="hint" style={{ margin: 0 }}>
                    {entity.summary.trim() || t("editor.storyBiblePanel.noSummary")}
                  </p>
                  <p className="hint" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {entity.notes.trim() || t("editor.storyBiblePanel.noNotes")}
                  </p>

                  {imagesById[entity.id] && imagesById[entity.id].length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {imagesById[entity.id].slice(0, 6).map((img) => (
                        <img
                          key={img.fileName}
                          src={img.url}
                          alt={img.fileName}
                          style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>
                      {t("editor.storyBiblePanel.noImages")}
                    </p>
                  )}

                  {relationsFor(entity.id).length > 0 ? (
                    relationsFor(entity.id).map((r) => (
                      <p key={r.id} className="hint" style={{ margin: 0 }}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(r.fromId)}
                          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
                        >
                          {entityName(r.fromId)}
                        </button>
                        {` — ${r.label} → `}
                        <button
                          type="button"
                          onClick={() => setExpandedId(r.toId)}
                          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
                        >
                          {entityName(r.toId)}
                        </button>
                      </p>
                    ))
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>
                      {t("editor.storyBiblePanel.noRelations")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => navigate(`/p/${encodeURIComponent(projectId)}/story-bible`)}>
        {t("editor.storyBiblePanel.openFull")}
      </button>
    </div>
  );
}
