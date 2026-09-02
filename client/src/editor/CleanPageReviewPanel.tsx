import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  onApply: () => void;
  onCancel: () => void;
}

/** Review-before-commit step for Cleaning/Inpainting — same "nothing reaches the
 * layout until an explicit confirm" principle as AutoBubblesReviewPanel.tsx and
 * AiTranslateReviewPanel.tsx, just a before/after image comparison instead of a list
 * of text rows (there's nothing per-item to accept/reject here — Cleaning is one
 * whole-page result). Confirming only flips `useCleanedBackground` (see
 * editorStore.ts's setUseCleanedBackground()) — the cleaned pixels themselves are
 * already sitting in the server's cache regardless of whether the user confirms, see
 * useCleanPageRun.ts's doc comment. */
export function CleanPageReviewPanel({ beforeUrl, afterUrl, onApply, onCancel }: Props) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onCancel}>
      <div className="inspector" style={{ maxWidth: 720 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.cleanPage.reviewTitle")}</p>
        <p className="hint" style={{ margin: 0 }}>{t("editor.cleanPage.reviewHint")}</p>
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <div style={{ flex: "1 1 50%" }}>
            <div className="hint" style={{ margin: 0 }}>{t("editor.cleanPage.before")}</div>
            <img src={beforeUrl} alt="" style={{ width: "100%", display: "block", border: "1px solid var(--border)" }} />
          </div>
          <div style={{ flex: "1 1 50%" }}>
            <div className="hint" style={{ margin: 0 }}>{t("editor.cleanPage.after")}</div>
            <img src={afterUrl} alt="" style={{ width: "100%", display: "block", border: "1px solid var(--border)" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="primary" onClick={onApply}>
            {t("editor.cleanPage.apply")}
          </button>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
