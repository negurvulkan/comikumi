import { useTranslation } from "react-i18next";
import type { FixReadingOrderAction, ReadingOrderTarget } from "./aiActions/fixReadingOrderAction";

interface Props {
  action: FixReadingOrderAction;
  targets: ReadingOrderTarget[];
  onApply: () => void;
  onDismiss: () => void;
}

/** Single accept/reject decision, not a per-row list like AiBubblePatchReviewPanel —
 * a reading-order permutation is one cohesive proposal (see
 * aiActions/fixReadingOrderAction.ts's parseFixReadingOrderAction doc comment on why a
 * partial order can't be safely applied), so partial acceptance doesn't make sense
 * here. Shows the proposed order as a read-only numbered preview for review. */
export function AiReadingOrderReviewPanel({ action, targets, onApply, onDismiss }: Props) {
  const { t } = useTranslation();
  const byId = new Map(targets.map((t2) => [t2.bubbleId, t2.text]));

  return (
    <div className="inspector" style={{ maxWidth: 480 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.aiPanel.actions.fixReadingOrder.reviewTitle")}</p>
      <p className="hint" style={{ margin: 0 }}>{t("editor.aiPanel.actions.fixReadingOrder.reviewHint")}</p>
      {action.note && <p className="hint" style={{ margin: 0, fontStyle: "italic" }}>{action.note}</p>}
      <ol style={{ margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
        {action.order.map((bubbleId) => (
          <li key={bubbleId} style={{ fontSize: 13 }}>
            {byId.get(bubbleId) || bubbleId}
          </li>
        ))}
      </ol>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="primary" onClick={onApply}>
          {t("editor.aiPanel.actions.fixReadingOrder.accept")}
        </button>
        <button type="button" onClick={onDismiss}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
