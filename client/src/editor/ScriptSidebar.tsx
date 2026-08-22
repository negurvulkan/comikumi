import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScriptDocument } from "../../../shared/src/script";
import { scriptPageDisplayLabel } from "../../../shared/src/script";
import type { PageLayout } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { ScriptPanelCard } from "./ScriptPanelCard";
import { addPanel, deletePanel, movePanel, scriptPageFromLayout, updatePanel } from "./scriptEditing";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — same convention
   * as TextListPanel.tsx/TranslatorContextPanel.tsx's `open` prop. */
  open: boolean;
  volumeId: string;
  /** The real, currently open page (e.g. "page_03") — looked up against every script
   * page's `linkedPage` to find the one to show/edit here. */
  page: string;
  /** The currently open page's own layout — used to bootstrap a new linked script
   * page's panels/dialogue straight from its bubbles instead of starting empty. */
  layout: PageLayout;
  /** Omitted (not just falsy) when nothing is selected, so ScriptPanelCard's
   * "insert into bubble" button is entirely absent rather than merely disabled —
   * only the clipboard-copy button remains in that case. */
  onInsertIntoBubble?: (text: string) => void;
  onClose: () => void;
}

export function ScriptSidebar({ open, volumeId, page, layout, onInsertIntoBubble, onClose }: Props) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<ScriptDocument | null>(null);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [scriptLanguage, setScriptLanguage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [linkChoice, setLinkChoice] = useState("");

  useEffect(() => {
    api.getScript(volumeId).then(setDoc).catch((e) => setError(translateApiError(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId]);

  useEffect(() => {
    api.listLanguages().then((langs) => {
      setLanguages(langs);
      setScriptLanguage((cur) => cur || langs[0]?.code || "");
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

  if (!doc) {
    return (
      <div className={`text-sidebar${open ? " open" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{t("script.title")}</p>
          <button onClick={onClose}>{t("common.close")}</button>
        </div>
        {error ? <div className="error-banner">{error}</div> : <p className="hint">{t("common.loading")}</p>}
      </div>
    );
  }

  const linkedIndex = doc.pages.findIndex((p) => p.linkedPage === page);
  const linkedPage = linkedIndex >= 0 ? doc.pages[linkedIndex] : null;
  const unlinkedPages = doc.pages.filter((p) => p.linkedPage === null);
  // Closures below can't rely on TS's null-narrowing of `doc` carrying through a
  // nested function declaration, even though we already returned above when it was
  // null — capture it as a definitely-non-null local instead.
  const currentDoc = doc;

  function handleLink() {
    if (!linkChoice) return;
    update({ pages: currentDoc.pages.map((p) => (p.id === linkChoice ? { ...p, linkedPage: page } : p)) });
    setLinkChoice("");
  }

  function handleCreateAndLink() {
    update({ pages: [...currentDoc.pages, scriptPageFromLayout(page, layout)] });
  }

  function handleUnlink() {
    if (!linkedPage) return;
    update({ pages: currentDoc.pages.map((p) => (p.id === linkedPage.id ? { ...p, linkedPage: null } : p)) });
  }

  function applyToLinkedPage(fn: (pageDoc: (typeof currentDoc.pages)[number]) => (typeof currentDoc.pages)[number]) {
    if (!linkedPage) return;
    update({ pages: currentDoc.pages.map((p) => (p.id === linkedPage.id ? fn(p) : p)) });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api.saveScript(volumeId, currentDoc);
      setSavedMsg(t("settings.savedMsg"));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`text-sidebar${open ? " open" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("script.title")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>

      {!linkedPage ? (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {t("script.noLinkForPage")}
          </p>
          {unlinkedPages.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <select value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)} style={{ flex: 1 }}>
                <option value="">{t("script.chooseScriptPage")}</option>
                {unlinkedPages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {scriptPageDisplayLabel(p, t("script.pageFallbackLabel", { index: doc.pages.indexOf(p) + 1 }))}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleLink} disabled={!linkChoice}>
                {t("script.link")}
              </button>
            </div>
          )}
          <button type="button" onClick={handleCreateAndLink}>
            {t("script.createLinkedPage")}
          </button>
        </>
      ) : (
        <>
          <div className="field-label-row">
            <p className="hint" style={{ margin: 0 }}>
              {t("script.linkedWithPage", { page })}
            </p>
            <button type="button" onClick={handleUnlink}>
              {t("script.unlink")}
            </button>
          </div>

          <div className="langstrip langstrip-horizontal">
            {languages.map((l) => (
              <button
                key={l.code}
                className={`lang-chip${l.code === scriptLanguage ? " active" : ""}`}
                onClick={() => setScriptLanguage(l.code)}
                title={l.label}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>

          {linkedPage.panels.map((panel, panelIndex) => (
            <ScriptPanelCard
              key={panel.id}
              panel={panel}
              index={panelIndex}
              language={scriptLanguage}
              characters={characters}
              glossary={glossary}
              onChange={(patch) => applyToLinkedPage((p) => updatePanel(p, panel.id, patch))}
              onDelete={() => applyToLinkedPage((p) => deletePanel(p, panel.id))}
              onMove={(direction) => applyToLinkedPage((p) => movePanel(p, panel.id, direction))}
              canMoveUp={panelIndex > 0}
              canMoveDown={panelIndex < linkedPage.panels.length - 1}
              onInsertDialogue={onInsertIntoBubble}
            />
          ))}
          <button type="button" onClick={() => applyToLinkedPage(addPanel)}>
            {t("script.addPanel")}
          </button>
        </>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="primary" onClick={handleSave} disabled={saving}>
          {saving ? t("settings.saving") : t("common.save")}
        </button>
      </div>
      {savedMsg && <p style={{ color: "#b3ffc0", margin: "8px 0 0" }}>{savedMsg}</p>}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
