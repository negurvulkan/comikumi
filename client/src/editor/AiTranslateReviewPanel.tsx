import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TranslateMissingBubblesAction, MissingTranslationTarget } from "./aiTranslateAction";
import type { FixGlossaryUsageAction, GlossaryUsageTarget } from "./aiActions/fixGlossaryUsageAction";

interface Row {
  bubbleId: string;
  language: string;
  text: string;
  hint: string | null;
}

type Props =
  | { action: TranslateMissingBubblesAction; targets: MissingTranslationTarget[]; onApply: (patches: { bubbleId: string; language: string; text: string }[]) => void; onDismiss: () => void }
  | { action: FixGlossaryUsageAction; targets: GlossaryUsageTarget[]; onApply: (patches: { bubbleId: string; language: string; text: string }[]) => void; onDismiss: () => void };

/** Review-before-apply step for the AI's bubble-text-patch suggestions — both
 * "translate missing bubbles" (aiTranslateAction.ts) and "fix glossary usage"
 * (aiActions/fixGlossaryUsageAction.ts) resolve to the exact same
 * `{bubbleId, language, text}` patch shape and the same applyBubbleTextPatches() apply
 * side, so they share this one review panel — only the title/hint copy and the
 * per-row context line ("hint": source text vs. the glossary term being corrected)
 * differ, both driven by `action.action`. Same accept/edit/reject-per-row shape as
 * AutoBubblesReviewPanel.tsx (this session's established pattern for "automation
 * proposes, user confirms before it touches the layout"), inline in the chat
 * transcript rather than a modal. Nothing reaches editorStore until "Übernehmen". */
export function AiTranslateReviewPanel({ action, targets, onApply, onDismiss }: Props) {
  const { t } = useTranslation();
  const isGlossaryFix = action.action === "fix_glossary_usage";
  const rows: Row[] = action.translations.map((tr) => {
    if (isGlossaryFix) {
      const target = (targets as GlossaryUsageTarget[]).find((tg) => tg.bubbleId === tr.bubbleId && tg.language === action.language);
      const hint = target ? t("editor.aiPanel.actions.fixGlossaryUsage.termHint", { term: target.term, translation: target.approvedTranslation }) : null;
      return { bubbleId: tr.bubbleId, language: action.language, text: tr.text, hint };
    }
    const target = (targets as MissingTranslationTarget[]).find((tg) => tg.bubbleId === tr.bubbleId && tg.language === action.language);
    const hint = target ? `${t("editor.aiPanel.actions.translateMissing.sourceLabel", { language: target.sourceLanguage })}: ${target.sourceText}` : null;
    return { bubbleId: tr.bubbleId, language: action.language, text: tr.text, hint };
  });

  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(rows.map((r) => r.bubbleId)));
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.bubbleId, r.text])));

  function toggle(id: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApply() {
    const patches = rows
      .filter((r) => accepted.has(r.bubbleId))
      .map((r) => ({ bubbleId: r.bubbleId, language: r.language, text: texts[r.bubbleId] ?? "" }));
    onApply(patches);
  }

  const titleKey = isGlossaryFix ? "editor.aiPanel.actions.fixGlossaryUsage.reviewTitle" : "editor.aiPanel.actions.translateMissing.reviewTitle";
  const hintKey = isGlossaryFix ? "editor.aiPanel.actions.fixGlossaryUsage.reviewHint" : "editor.aiPanel.actions.translateMissing.reviewHint";

  return (
    <div className="inspector" style={{ maxWidth: 480 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t(titleKey, { count: rows.length, language: action.language })}</p>
      <p className="hint" style={{ margin: 0 }}>{t(hintKey)}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {rows.map((row) => (
          <div key={row.bubbleId} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <input type="checkbox" checked={accepted.has(row.bubbleId)} onChange={() => toggle(row.bubbleId)} style={{ marginTop: 6 }} />
            <div style={{ flex: "1 1 auto" }}>
              {row.hint && (
                <div className="hint" style={{ margin: 0 }}>
                  {row.hint}
                </div>
              )}
              <textarea
                value={texts[row.bubbleId] ?? ""}
                onChange={(e) => setTexts((prev) => ({ ...prev, [row.bubbleId]: e.target.value }))}
                disabled={!accepted.has(row.bubbleId)}
                style={{ width: "100%", minHeight: 44 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="primary" onClick={handleApply} disabled={accepted.size === 0}>
          {t("editor.aiPanel.actions.common.applyCount", { count: accepted.size })}
        </button>
        <button type="button" onClick={onDismiss}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
