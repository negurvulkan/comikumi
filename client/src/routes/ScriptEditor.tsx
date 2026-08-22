import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { v4 as uuid } from "uuid";
import type { ScriptDocument, ScriptPage, ScriptPanel, ScriptPanelSize } from "../../../shared/src/script";
import { scriptPageDisplayLabel } from "../../../shared/src/script";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { GlossaryHighlightedTextarea } from "../editor/GlossaryHighlightedTextarea";
import { useProject } from "../state/ProjectContext";

function emptyPanel(): ScriptPanel {
  return { id: uuid(), sizeHint: "medium", composition: "", action: "", dialogue: [] };
}

function emptyPage(): ScriptPage {
  return { id: uuid(), label: "", notes: "", panels: [] };
}

interface DialogueRowProps {
  line: ScriptPanel["dialogue"][number];
  language: string;
  characters: Character[];
  glossary: GlossaryEntry[];
  onChange: (patch: Partial<ScriptPanel["dialogue"][number]>) => void;
  onDelete: () => void;
}

function DialogueRow({ line, language, characters, glossary, onChange, onDelete }: DialogueRowProps) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const speaker = characters.find((c) => c.id === line.characterId);

  function handleCopy() {
    navigator.clipboard
      .writeText(line.text[language] ?? "")
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("failed"))
      .finally(() => setTimeout(() => setCopyState("idle"), 1500));
  }

  return (
    <div className="field-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={line.characterId ?? ""}
          onChange={(e) => onChange({ characterId: e.target.value || null })}
          style={{ flex: "0 0 auto" }}
        >
          <option value="">{t("editor.contextMenu.noCharacter")}</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={line.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder={t("script.dialogueNotePlaceholder")}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={handleCopy} title={t("script.copyLine")}>
          {copyState === "copied" ? t("script.copied") : copyState === "failed" ? t("script.copyFailed") : t("script.copyLine")}
        </button>
        <button type="button" onClick={onDelete} style={{ color: "#ff8a95" }}>
          ×
        </button>
      </div>
      {speaker?.voiceNotes.trim() && (
        <p className="hint" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          <strong style={{ color: "var(--text)" }}>{t("managers.characters.voiceNotesLabel")}:</strong> {speaker.voiceNotes}
        </p>
      )}
      <GlossaryHighlightedTextarea
        value={line.text[language] ?? ""}
        onChange={(v) => onChange({ text: { ...line.text, [language]: v } })}
        glossary={glossary}
        activeLanguage={language}
      />
    </div>
  );
}

interface PanelCardProps {
  panel: ScriptPanel;
  index: number;
  language: string;
  characters: Character[];
  glossary: GlossaryEntry[];
  onChange: (patch: Partial<ScriptPanel>) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function PanelCard({ panel, index, language, characters, glossary, onChange, onDelete, onMove, canMoveUp, canMoveDown }: PanelCardProps) {
  const { t } = useTranslation();

  function addLine() {
    onChange({ dialogue: [...panel.dialogue, { id: uuid(), characterId: null, text: {}, note: "" }] });
  }

  function updateLine(lineId: string, patch: Partial<ScriptPanel["dialogue"][number]>) {
    onChange({ dialogue: panel.dialogue.map((d) => (d.id === lineId ? { ...d, ...patch } : d)) });
  }

  function deleteLine(lineId: string) {
    onChange({ dialogue: panel.dialogue.filter((d) => d.id !== lineId) });
  }

  return (
    <div className="inspector" style={{ margin: "0 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("script.panelLabel", { index: index + 1 })}</p>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={() => onMove("up")} disabled={!canMoveUp}>
            ↑
          </button>
          <button type="button" onClick={() => onMove("down")} disabled={!canMoveDown}>
            ↓
          </button>
          <button type="button" onClick={onDelete} style={{ color: "#ff8a95" }}>
            {t("script.deletePanel")}
          </button>
        </div>
      </div>

      <label>
        {t("script.sizeHintLabel")}
        <select value={panel.sizeHint} onChange={(e) => onChange({ sizeHint: e.target.value as ScriptPanelSize })}>
          <option value="small">{t("script.sizeSmall")}</option>
          <option value="medium">{t("script.sizeMedium")}</option>
          <option value="large">{t("script.sizeLarge")}</option>
        </select>
      </label>

      <label>
        {t("script.compositionLabel")}
        <textarea value={panel.composition} onChange={(e) => onChange({ composition: e.target.value })} style={{ minHeight: 50 }} />
      </label>

      <label>
        {t("script.actionLabel")}
        <textarea value={panel.action} onChange={(e) => onChange({ action: e.target.value })} style={{ minHeight: 50 }} />
      </label>

      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{t("script.dialogueHeading")}</p>
      {panel.dialogue.map((line) => (
        <DialogueRow
          key={line.id}
          line={line}
          language={language}
          characters={characters}
          glossary={glossary}
          onChange={(patch) => updateLine(line.id, patch)}
          onDelete={() => deleteLine(line.id)}
        />
      ))}
      <button type="button" onClick={addLine}>
        {t("script.addDialogueLine")}
      </button>
    </div>
  );
}

export function ScriptEditor() {
  const { t } = useTranslation();
  const { volumeId = "" } = useParams();
  const { project } = useProject();
  const [doc, setDoc] = useState<ScriptDocument | null>(null);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [language, setLanguage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

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

  function addPage() {
    if (!doc) return;
    update({ pages: [...doc.pages, emptyPage()] });
  }

  function updatePage(pageId: string, patch: Partial<ScriptPage>) {
    if (!doc) return;
    update({ pages: doc.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)) });
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

  function addPanel(pageId: string) {
    updatePage(pageId, { panels: [...(doc?.pages.find((p) => p.id === pageId)?.panels ?? []), emptyPanel()] });
  }

  function updatePanel(pageId: string, panelId: string, patch: Partial<ScriptPanel>) {
    if (!doc) return;
    update({
      pages: doc.pages.map((p) =>
        p.id !== pageId ? p : { ...p, panels: p.panels.map((pan) => (pan.id === panelId ? { ...pan, ...patch } : pan)) }
      ),
    });
  }

  function deletePanel(pageId: string, panelId: string) {
    if (!doc) return;
    update({ pages: doc.pages.map((p) => (p.id !== pageId ? p : { ...p, panels: p.panels.filter((pan) => pan.id !== panelId) })) });
  }

  function movePanel(pageId: string, panelId: string, direction: "up" | "down") {
    if (!doc) return;
    update({
      pages: doc.pages.map((p) => {
        if (p.id !== pageId) return p;
        const idx = p.panels.findIndex((pan) => pan.id === panelId);
        const swapWith = direction === "up" ? idx - 1 : idx + 1;
        if (idx < 0 || swapWith < 0 || swapWith >= p.panels.length) return p;
        const panels = [...p.panels];
        [panels[idx], panels[swapWith]] = [panels[swapWith], panels[idx]];
        return { ...p, panels };
      }),
    });
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
        <Link to={`/volumes/${encodeURIComponent(volumeId)}`}>{t("script.backToPages")}</Link>
        <span className="canvas-titlebar-name">{t("script.title")}</span>
        <span className="canvas-titlebar-path">/{project ? `${project.name}/${volumeId}` : volumeId}</span>
      </div>

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

            {page.panels.map((panel, panelIndex) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                index={panelIndex}
                language={language}
                characters={characters}
                glossary={glossary}
                onChange={(patch) => updatePanel(page.id, panel.id, patch)}
                onDelete={() => deletePanel(page.id, panel.id)}
                onMove={(direction) => movePanel(page.id, panel.id, direction)}
                canMoveUp={panelIndex > 0}
                canMoveDown={panelIndex < page.panels.length - 1}
              />
            ))}
            <button type="button" onClick={() => addPanel(page.id)}>
              {t("script.addPanel")}
            </button>
          </div>
        ))}

        <button type="button" onClick={addPage}>
          {t("script.addPage")}
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" className="primary" onClick={handleSave} disabled={saving}>
            {saving ? t("settings.saving") : t("common.save")}
          </button>
        </div>
        {savedMsg && <p style={{ color: "#b3ffc0", margin: "8px 0 0" }}>{savedMsg}</p>}
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
