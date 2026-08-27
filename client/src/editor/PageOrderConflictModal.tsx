import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface Props {
  onKeepMine: () => void;
  onReload: () => void;
}

/** Shown when PageGrid.tsx's savePageOrder() gets a 409 back — someone else saved a
 * different page order since this session last loaded/saved it (see
 * server/src/routes/pageOrder.ts's If-Match check). Same UX shape as
 * LayoutConflictModal.tsx (own small file rather than a shared abstraction — both are
 * small enough that cloning with their own copy is simpler): backdrop click/Escape
 * resolves the same way as the explicit "load their version" button, the least
 * destructive default since it only discards this session's own unsaved reordering,
 * never the other person's already-saved one. */
export function PageOrderConflictModal({ onKeepMine, onReload }: Props) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onReload}>
      <div className="inspector" style={{ maxWidth: 420 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("pageGrid.orderConflictTitle")}</p>
        <p className="hint" style={{ margin: 0 }}>{t("pageGrid.orderConflictMessage")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button type="button" className="primary" onClick={onKeepMine}>
            {t("pageGrid.orderConflictKeepMine")}
          </button>
          <button type="button" className="danger" onClick={onReload}>
            {t("pageGrid.orderConflictReload")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
