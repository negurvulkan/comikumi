import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SuggestTranslationNoteAction } from "./aiActions/suggestTranslationNoteAction";

interface Props {
  action: SuggestTranslationNoteAction;
  onApply: (noteText: string) => Promise<void>;
  onDismiss: () => void;
}

/** Review-before-post for the AI's suggested translation note — applying posts it as a
 * normal page (or bubble-pinned) review comment via the host's existing
 * api.createComment() call (see Editor.tsx's handleSubmitNewComment for the same call),
 * so it shows up in CommentsPanel like any human-written note, editable/deletable the
 * same way afterward. */
export function AiTranslationNoteReviewPanel({ action, onApply, onDismiss }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(action.note);
  const [busy, setBusy] = useState(false);

  async function handleApply() {
    setBusy(true);
    try {
      await onApply(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 480 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.aiPanel.actions.suggestTranslationNote.reviewTitle")}</p>
      <p className="hint" style={{ margin: 0 }}>{t("editor.aiPanel.actions.suggestTranslationNote.reviewHint")}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", minHeight: 60, marginTop: 6 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="primary" onClick={handleApply} disabled={!text.trim() || busy}>
          {t("editor.aiPanel.actions.suggestTranslationNote.postButton")}
        </button>
        <button type="button" onClick={onDismiss} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
