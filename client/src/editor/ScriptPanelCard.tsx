import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScriptPanel, ScriptPanelSize, ScriptDialogueLine } from "../../../shared/src/script";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import { GlossaryHighlightedTextarea } from "./GlossaryHighlightedTextarea";
import { addDialogueLine, deleteDialogueLine, updateDialogueLine } from "./scriptEditing";

interface DialogueRowProps {
  line: ScriptDialogueLine;
  language: string;
  characters: Character[];
  glossary: GlossaryEntry[];
  onChange: (patch: Partial<ScriptDialogueLine>) => void;
  onDelete: () => void;
  /** Only passed by the page editor's script sidebar (ScriptSidebar.tsx) — renders an
   * extra "insert into bubble" button alongside the clipboard-copy one. Omitted in the
   * standalone script editor, which has no selected bubble to insert into. */
  onInsertDialogue?: (text: string) => void;
}

function DialogueRow({ line, language, characters, glossary, onChange, onDelete, onInsertDialogue }: DialogueRowProps) {
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
        {onInsertDialogue && (
          <button type="button" onClick={() => onInsertDialogue(line.text[language] ?? "")} title={t("script.insertIntoBubble")}>
            {t("script.insertIntoBubble")}
          </button>
        )}
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

interface ScriptPanelCardProps {
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
  onInsertDialogue?: (text: string) => void;
}

export function ScriptPanelCard({
  panel,
  index,
  language,
  characters,
  glossary,
  onChange,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
  onInsertDialogue,
}: ScriptPanelCardProps) {
  const { t } = useTranslation();

  function addLine() {
    onChange({ dialogue: addDialogueLine(panel).dialogue });
  }

  function updateLine(lineId: string, patch: Partial<ScriptDialogueLine>) {
    onChange({ dialogue: updateDialogueLine(panel, lineId, patch).dialogue });
  }

  function deleteLine(lineId: string) {
    onChange({ dialogue: deleteDialogueLine(panel, lineId).dialogue });
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
          onInsertDialogue={onInsertDialogue}
        />
      ))}
      <button type="button" onClick={addLine}>
        {t("script.addDialogueLine")}
      </button>
    </div>
  );
}
