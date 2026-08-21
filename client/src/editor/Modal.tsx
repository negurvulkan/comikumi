import { useEffect } from "react";
import type { ReactNode } from "react";

interface Props {
  onClose: () => void;
  children: ReactNode;
}

/** Generic backdrop + centered card wrapper — Escape or a backdrop click closes it,
 * clicking the card itself does not. Used to host ExportPanel as a real dialog. */
export function Modal({ onClose, children }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
