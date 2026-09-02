import { useState } from "react";
import { useTranslation } from "react-i18next";

export interface BubblePatchRow {
  /** A composite key uniquely identifying this ONE proposed patch, not necessarily
   * just the bubble id — fix_bubble_overflow can propose two patches for the same
   * bubble (one per overflowing language), so its rows key by `${bubbleId}:${language}`
   * instead; assign_characters/style_sfx_bubbles (one patch per bubble) just use the
   * bare bubbleId. Opaque to this component either way — the caller maps accepted ids
   * back to real patches. */
  id: string;
  /** Short line of context so the reviewer can tell which bubble this is without
   * switching to the canvas — the bubble's own current text, truncated by the caller. */
  bubbleText: string;
  /** Human-readable summary of what would change (e.g. "320×180px → 420×220px @ 20px",
   * "→ Aiko", "Preset „Manga SFX", −8°") — formatted by the caller per action kind,
   * since the fields being patched differ per action. */
  summary: string;
  /** The model's own short justification for this specific suggestion. */
  note: string;
}

interface Props {
  titleKey: string;
  hintKey: string;
  rows: BubblePatchRow[];
  onApply: (acceptedIds: string[]) => void;
  onDismiss: () => void;
}

/** Shared accept/reject-per-row review panel for the AI's bubble-FIELD-patch actions
 * (fix overflow, assign characters, style SFX bubbles) — unlike
 * AiTranslateReviewPanel.tsx's free-text edit (appropriate for translated text), these
 * patches are structural (geometry/character/preset ids), so review here is
 * accept/reject only, not inline editing — same "review-gate everything" principle,
 * just without a text field to edit. Nothing reaches editorStore until "Übernehmen". */
export function AiBubblePatchReviewPanel({ titleKey, hintKey, rows, onApply, onDismiss }: Props) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));

  function toggle(id: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="inspector" style={{ maxWidth: 480 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t(titleKey, { count: rows.length })}</p>
      <p className="hint" style={{ margin: 0 }}>{t(hintKey)}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <input type="checkbox" checked={accepted.has(row.id)} onChange={() => toggle(row.id)} style={{ marginTop: 6 }} />
            <div style={{ flex: "1 1 auto" }}>
              {row.bubbleText && (
                <div className="hint" style={{ margin: 0, fontStyle: "italic" }}>
                  "{row.bubbleText}"
                </div>
              )}
              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.summary}</div>
              <div className="hint" style={{ margin: 0 }}>{row.note}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="primary" onClick={() => onApply([...accepted])} disabled={accepted.size === 0}>
          {t("editor.aiPanel.actions.common.applyCount", { count: accepted.size })}
        </button>
        <button type="button" onClick={onDismiss}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
