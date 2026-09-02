import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { PageMetaDocument } from "../../../shared/src/pageMeta";
import type { SuggestChaptersAction } from "./aiActions/suggestChaptersAction";

interface Props {
  action: SuggestChaptersAction;
  volumeId: string;
  pageNames: string[];
  pageMeta: PageMetaDocument;
  metaEtag: string | null;
  onSaved: (nextMeta: PageMetaDocument, nextEtag: string | null) => void;
  onConflict: () => void;
  onDismiss: () => void;
}

/** Review-before-apply for the AI's proposed chapter breakdown — volume-scoped (see
 * aiActions/suggestChaptersAction.ts), so applying means one savePageMeta() call
 * touching both `chapters` (new entries) and every page in each accepted range's
 * `chapterId`, same ETag/conflict-handling shape as PageGrid.tsx's own
 * updatePageMeta() — on a 409 this just reloads rather than trying to merge, same
 * "tagging edits are quick, no in-progress state worth preserving" reasoning that
 * function's own doc comment gives. */
export function AiSuggestChaptersReviewPanel({ action, volumeId, pageNames, pageMeta, metaEtag, onSaved, onConflict, onDismiss }: Props) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(action.chapters.map((_, i) => i)));
  const [busy, setBusy] = useState(false);

  function toggle(i: number) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleApply() {
    setBusy(true);
    try {
      const indexOf = new Map(pageNames.map((p, i) => [p, i]));
      let nextMeta = pageMeta;
      for (let i = 0; i < action.chapters.length; i++) {
        if (!accepted.has(i)) continue;
        const { name, fromPage, toPage } = action.chapters[i];
        const from = indexOf.get(fromPage);
        const to = indexOf.get(toPage);
        if (from === undefined || to === undefined) continue;
        const chapterId = crypto.randomUUID();
        const pages = { ...nextMeta.pages };
        for (let idx = from; idx <= to; idx++) {
          pages[pageNames[idx]] = { ...pages[pageNames[idx]], chapterId };
        }
        nextMeta = { chapters: [...nextMeta.chapters, { id: chapterId, name }], pages };
      }
      const result = await api.savePageMeta(volumeId, nextMeta, metaEtag ?? undefined);
      if (result.conflict) {
        onConflict();
        return;
      }
      onSaved(nextMeta, result.etag);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 480 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.aiPanel.actions.suggestChapters.reviewTitle", { count: action.chapters.length })}</p>
      <p className="hint" style={{ margin: 0 }}>{t("editor.aiPanel.actions.suggestChapters.reviewHint")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {action.chapters.map((chapter, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <input type="checkbox" checked={accepted.has(i)} onChange={() => toggle(i)} style={{ marginTop: 6 }} />
            <div style={{ flex: "1 1 auto" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{chapter.name}</div>
              <div className="hint" style={{ margin: 0 }}>
                {t("editor.aiPanel.actions.suggestChapters.rangeLabel", { from: chapter.fromPage, to: chapter.toPage })}
              </div>
              {chapter.note && <div className="hint" style={{ margin: 0 }}>{chapter.note}</div>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="primary" onClick={handleApply} disabled={accepted.size === 0 || busy}>
          {t("editor.aiPanel.actions.common.applyCount", { count: accepted.size })}
        </button>
        <button type="button" onClick={onDismiss} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
