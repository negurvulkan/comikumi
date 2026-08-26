import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ScriptDocument, ScriptPage, ScriptPanel } from "../../../shared/src/script";
import { scriptPageDisplayLabel } from "../../../shared/src/script";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { ScriptPanelCard } from "../editor/ScriptPanelCard";
import { addPanel, buildScriptContextText, deletePanel, emptyPage, movePanel, scriptPageFromLayout, updatePanel } from "../editor/scriptEditing";
import { StoryBiblePanel } from "../editor/StoryBiblePanel";
import { AIPanel } from "../editor/AIPanel";
import { BookIcon, AIAssistantIcon } from "../editor/Icons";
import { useProject } from "../state/ProjectContext";

export function ScriptEditor() {
  const { t } = useTranslation();
  const { volumeId = "", projectId = "" } = useParams();
  const pBase = `/p/${encodeURIComponent(projectId)}`;
  const { project } = useProject();
  const [doc, setDoc] = useState<ScriptDocument | null>(null);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [language, setLanguage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [showStoryBiblePanel, setShowStoryBiblePanel] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);

  useEffect(() => {
    api.getScript(volumeId).then(setDoc).catch((e) => setError(translateApiError(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId]);

  useEffect(() => {
    api.listLanguages().then((langs) => {
      setLanguages(langs);
      setLanguage((cur) => cur || langs[0]?.code || "");
    });
  }, []);

  useEffect(() => {
    api.listCharacters().then(setCharacters);
  }, []);

  useEffect(() => {
    api.listGlossary().then(setGlossary);
  }, []);

  function update(next: ScriptDocument) {
    setDoc(next);
    setSavedMsg(null);
  }

  function updatePage(pageId: string, patch: Partial<ScriptPage>) {
    if (!doc) return;
    update({ pages: doc.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)) });
  }

  function applyToPage(pageId: string, fn: (page: ScriptPage) => ScriptPage) {
    if (!doc) return;
    update({ pages: doc.pages.map((p) => (p.id === pageId ? fn(p) : p)) });
  }

  function addPage() {
    if (!doc) return;
    update({ pages: [...doc.pages, emptyPage()] });
  }

  function deletePage(pageId: string) {
    if (!doc) return;
    update({ pages: doc.pages.filter((p) => p.id !== pageId) });
  }

  function movePage(pageId: string, direction: "up" | "down") {
    if (!doc) return;
    const idx = doc.pages.findIndex((p) => p.id === pageId);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= doc.pages.length) return;
    const pages = [...doc.pages];
    [pages[idx], pages[swapWith]] = [pages[swapWith], pages[idx]];
    update({ pages });
  }

  async function handleGenerateFromVolume() {
    if (!doc) return;
    setGenerating(true);
    setGenerateMsg(null);
    setError(null);
    try {
      const rows = await api.getVolumeReport(volumeId);
      const linkedPages = new Set(doc.pages.map((p) => p.linkedPage).filter((p): p is string => p !== null));
      const newPages = rows
        .filter((r) => !linkedPages.has(r.page))
        .map((r) => scriptPageFromLayout(r.page, r.layout, project?.readingDirection ?? "rtl"));
      if (newPages.length === 0) {
        setGenerateMsg(t("script.noNewPagesFound"));
      } else {
        update({ pages: [...doc.pages, ...newPages] });
        setGenerateMsg(t("script.generatedCount", { count: newPages.length }));
      }
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api.saveScript(volumeId, doc);
      setSavedMsg(t("settings.savedMsg"));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setSaving(false);
    }
  }

  if (error && !doc) return <div className="error-banner">{error}</div>;
  if (!doc) return <p>{t("common.loading")}</p>;

  return (
    <div className="page">
      <div className="canvas-titlebar">
        <Link to={`${pBase}/volumes/${encodeURIComponent(volumeId)}`}>{t("script.backToPages")}</Link>
        <span className="canvas-titlebar-name">{t("script.title")}</span>
        <span className="canvas-titlebar-path">/{project ? `${project.name}/${volumeId}` : volumeId}</span>
        <button
          type="button"
          className={`tool-btn${showStoryBiblePanel ? " active" : ""}`}
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setShowStoryBiblePanel((v) => !v);
            setShowAIPanel(false);
          }}
          title={t("editor.toolStrip.storyBible")}
        >
          <BookIcon />
        </button>
        <button
          type="button"
          className={`tool-btn${showAIPanel ? " active" : ""}`}
          onClick={() => {
            setShowAIPanel((v) => !v);
            setShowStoryBiblePanel(false);
          }}
          title={t("editor.toolStrip.aiAssistant")}
        >
          <AIAssistantIcon />
        </button>
      </div>

      <div className="editor-body">
        <StoryBiblePanel open={showStoryBiblePanel} onClose={() => setShowStoryBiblePanel(false)} />
        <AIPanel
          open={showAIPanel}
          onClose={() => setShowAIPanel(false)}
          contextLabel={t("editor.aiPanel.contextCurrentScript")}
          contextText={buildScriptContextText(doc, characters, language)}
        />
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}>
          <div className="langstrip langstrip-horizontal" style={{ margin: "8px 12px" }}>
            {languages.map((l) => (
              <button
                key={l.code}
                className={`lang-chip${l.code === language ? " active" : ""}`}
                onClick={() => setLanguage(l.code)}
                title={l.label}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="page-scroll" style={{ padding: "0 16px 16px" }}>
            {doc.pages.map((page, pageIndex) => (
              <div key={page.id} className="inspector" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    {scriptPageDisplayLabel(page, t("script.pageFallbackLabel", { index: pageIndex + 1 }))}
                  </p>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => movePage(page.id, "up")} disabled={pageIndex === 0}>
                      ↑
                    </button>
                    <button type="button" onClick={() => movePage(page.id, "down")} disabled={pageIndex === doc.pages.length - 1}>
                      ↓
                    </button>
                    <button type="button" onClick={() => deletePage(page.id)} style={{ color: "#ff8a95" }}>
                      {t("script.deletePage")}
                    </button>
                  </div>
                </div>
                {page.linkedPage && (
                  <p className="hint" style={{ margin: 0 }}>
                    {t("script.linkedWithPage", { page: page.linkedPage })}
                  </p>
                )}
                <label>
                  {t("script.pageLabel")}
                  <input
                    value={page.label}
                    onChange={(e) => updatePage(page.id, { label: e.target.value })}
                    placeholder={t("script.pageFallbackLabel", { index: pageIndex + 1 })}
                  />
                </label>
                <label>
                  {t("script.pageNotesLabel")}
                  <textarea value={page.notes} onChange={(e) => updatePage(page.id, { notes: e.target.value })} style={{ minHeight: 40 }} />
                </label>

                {page.panels.map((panel: ScriptPanel, panelIndex) => (
                  <ScriptPanelCard
                    key={panel.id}
                    panel={panel}
                    index={panelIndex}
                    language={language}
                    characters={characters}
                    glossary={glossary}
                    onChange={(patch) => applyToPage(page.id, (p) => updatePanel(p, panel.id, patch))}
                    onDelete={() => applyToPage(page.id, (p) => deletePanel(p, panel.id))}
                    onMove={(direction) => applyToPage(page.id, (p) => movePanel(p, panel.id, direction))}
                    canMoveUp={panelIndex > 0}
                    canMoveDown={panelIndex < page.panels.length - 1}
                  />
                ))}
                <button type="button" onClick={() => applyToPage(page.id, addPanel)}>
                  {t("script.addPanel")}
                </button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={addPage}>
                {t("script.addPage")}
              </button>
              <button type="button" onClick={handleGenerateFromVolume} disabled={generating}>
                {t("script.generateFromVolume")}
              </button>
            </div>
            {generateMsg && <p className="hint" style={{ margin: "4px 0 0" }}>{generateMsg}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" className="primary" onClick={handleSave} disabled={saving}>
                {saving ? t("settings.saving") : t("common.save")}
              </button>
            </div>
            {savedMsg && <p style={{ color: "#b3ffc0", margin: "8px 0 0" }}>{savedMsg}</p>}
            {error && <div className="error-banner">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
