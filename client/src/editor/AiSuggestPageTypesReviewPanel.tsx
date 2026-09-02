import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { PageMetaDocument } from "../../../shared/src/pageMeta";
import type { SuggestPageTypesAction } from "./aiActions/suggestPageTypesAction";

interface Props {
  action: SuggestPageTypesAction;
  volumeId: string;
  pageMeta: PageMetaDocument;
  metaEtag: string | null;
  onSaved: (nextMeta: PageMetaDocument, nextEtag: string | null) => void;
  onConflict: () => void;
  onDismiss: () => void;
}

/** Review-before-apply for the AI's proposed page-type tags — same
 * ETag/conflict-handling shape as AiSuggestChaptersReviewPanel.tsx/PageGrid.tsx's own
 * updatePageMeta(). Deliberately low-confidence copy in the UI (see
 * aiActions/suggestPageTypesAction.ts's prompt) — this is a name/position guess, not a
 * visual classification, so accept/reject per row matters more here than usual. */
export function AiSuggestPageTypesReviewPanel({ action, volumeId, pageMeta, metaEtag, onSaved, onConflict, onDismiss }: Props) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(action.patches.map((_, i) => i)));
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
      const pages = { ...pageMeta.pages };
      action.patches.forEach((p, i) => {
        if (!accepted.has(i)) return;
        pages[p.page] = { ...pages[p.page], type: p.type };
      });
      const nextMeta: PageMetaDocument = { ...pageMeta, pages };
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
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.aiPanel.actions.suggestPageTypes.reviewTitle", { count: action.patches.length })}</p>
      <p className="hint" style={{ margin: 0 }}>{t("editor.aiPanel.actions.suggestPageTypes.reviewHint")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {action.patches.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <input type="checkbox" checked={accepted.has(i)} onChange={() => toggle(i)} style={{ marginTop: 6 }} />
            <div style={{ flex: "1 1 auto" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {p.page} → {t(`pageGrid.pageType_${p.type}`)}
              </div>
              {p.note && <div className="hint" style={{ margin: 0 }}>{p.note}</div>}
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
