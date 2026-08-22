import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in red (button.danger) instead of accent — for
   * destructive actions like permanent deletion. */
  danger?: boolean;
}

/** Styled, promise-based stand-in for window.confirm() — same call shape
 * (`if (!(await confirm("…"))) return;`), but rendered as the app's own Modal/card
 * look instead of the browser's native dialog chrome. Each caller renders the
 * returned `dialog` node once, anywhere in its own JSX tree; only one confirmation
 * can be pending per hook instance at a time (matches window.confirm's own
 * one-at-a-time, blocking nature — a second call before the first resolves would
 * simply replace the pending prompt). */
export function useConfirmDialog() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    setOptions(typeof opts === "string" ? { message: opts } : opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function settle(result: boolean) {
    setOptions(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }

  const dialog = options ? (
    <Modal onClose={() => settle(false)}>
      <div className="confirm-dialog">
        {options.title && <p className="confirm-dialog-title">{options.title}</p>}
        <p className="confirm-dialog-message">{options.message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={() => settle(false)}>
            {options.cancelLabel ?? t("common.cancel")}
          </button>
          <button type="button" className={options.danger ? "danger" : "primary"} onClick={() => settle(true)} autoFocus>
            {options.confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
