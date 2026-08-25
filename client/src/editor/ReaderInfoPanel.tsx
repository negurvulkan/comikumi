import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { ScriptDocument } from "../../../shared/src/script";
import { scriptPageDisplayLabel } from "../../../shared/src/script";
import type { LanguageDef } from "../../../shared/src/languages";
import { characterName } from "./reportUtils";
import { useResizableSidebarWidth } from "./useResizableSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — same convention as
   * TextListPanel.tsx's `open` prop. */
  open: boolean;
  page: string;
  characters: Character[];
  glossary: GlossaryEntry[];
  script: ScriptDocument | null;
  languages: LanguageDef[];
  onClose: () => void;
}

/** Read-only stand-in for CharacterManager/GlossaryManager/ScriptSidebar in the QC
 * Reader — deliberately NOT those components themselves, which are full CRUD forms:
 * a viewer-role account can't call their write endpoints anyway (403 server-side), so
 * showing the edit affordances here would just be a trap. Three stacked sections
 * instead of three separate toggled panels — QC work tends to want all three at once
 * ("who is this, is that the right term, what did the script say here"), not one at a
 * time. */
export function ReaderInfoPanel({ open, page, characters, glossary, script, languages, onClose }: Props) {
  const { t } = useTranslation();
  const resize = useResizableSidebarWidth();
  const [scriptLanguage, setScriptLanguage] = useState(languages[0]?.code ?? "");

  const scriptPage = script?.pages.find((p) => p.linkedPage === page) ?? null;

  return (
    <div className={`text-sidebar${open ? " open" : ""}`} style={{ width: open ? resize.width : undefined }}>
      <SidebarResizeHandle
        dragging={resize.dragging}
        onPointerDown={resize.handlePointerDown}
        onPointerMove={resize.handlePointerMove}
        onPointerUp={resize.handlePointerUp}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("reader.infoPanelTitle")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>

      <p style={{ margin: "6px 0 0", fontWeight: 600 }}>{t("managers.characters.title")}</p>
      {characters.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("reader.noCharacters")}
        </p>
      ) : (
        <div className="text-list">
          {characters.map((c) => (
            <div key={c.id} className="text-list-row" style={{ cursor: "default" }}>
              <span className="text-list-type" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                {c.name}
              </span>
              {c.voiceNotes.trim() && <span className="text-list-content">{c.voiceNotes}</span>}
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: "10px 0 0", fontWeight: 600 }}>{t("managers.glossary.title")}</p>
      {glossary.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("reader.noGlossary")}
        </p>
      ) : (
        <div className="text-list">
          {glossary.map((entry) => (
            <div key={entry.id} className="text-list-row" style={{ cursor: "default" }}>
              <span className="text-list-type">{entry.term}</span>
              <span className="text-list-content">
                {Object.entries(entry.translations)
                  .map(([code, term]) => `${code.toUpperCase()}: ${term}`)
                  .join(" · ") || t("reader.noTranslations")}
              </span>
              {entry.note.trim() && <span className="hint">{entry.note}</span>}
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: "10px 0 0", fontWeight: 600 }}>{t("script.title")}</p>
      {!scriptPage ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("reader.noLinkedScript")}
        </p>
      ) : (
        <>
          {languages.length > 1 && (
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
          )}
          <p className="hint" style={{ margin: 0 }}>
            {scriptPageDisplayLabel(scriptPage, t("reader.scriptPageFallback"))}
          </p>
          <div className="text-list">
            {scriptPage.panels.map((panel, i) => (
              <div key={panel.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="text-list-type">{t("reader.scriptPanelLabel", { index: i + 1 })}</span>
                {panel.composition.trim() && <span className="hint">{panel.composition}</span>}
                {panel.action.trim() && <span className="hint">{panel.action}</span>}
                {panel.dialogue.map((line) => (
                  <div key={line.id} className="text-list-row" style={{ cursor: "default" }}>
                    <span className="text-list-type">{characterName(characters, line.characterId)}</span>
                    <span className="text-list-content">{line.text[scriptLanguage] ?? ""}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
