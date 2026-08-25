import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface Props {
  onKeepMine: () => void;
  onReload: () => void;
}

/** Shown when editorStore.ts's save() gets a 409 back — someone else saved this exact
 * page since this session last loaded/saved it (see server/src/routes/layout.ts's
 * If-Match check). Backdrop click/Escape (Modal.tsx's onClose) resolves the same way as
 * the explicit "load their version" button — the least destructive default, since it
 * only discards this session's own uncommitted local edits, never the other person's
 * already-saved ones. */
export function LayoutConflictModal({ onKeepMine, onReload }: Props) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onReload}>
      <div className="inspector" style={{ maxWidth: 420 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.layoutConflict.title")}</p>
        <p className="hint" style={{ margin: 0 }}>{t("editor.layoutConflict.message")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button type="button" className="primary" onClick={onKeepMine}>
            {t("editor.layoutConflict.keepMine")}
          </button>
          <button type="button" className="danger" onClick={onReload}>
            {t("editor.layoutConflict.reload")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
