import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../state/SessionContext";
import { api } from "../api/client";
import { Modal } from "../editor/Modal";

const SEEN_KEY = "comikumi.demoEmailGateSeen";

/** Shown once per browser in demo mode — optional, never blocks entry into the app.
 * Skip and submit both permanently dismiss it (localStorage flag); submit is
 * fire-and-forget (server always responds ok, see routes/demo.ts's POST /email). */
export function EmailGateModal() {
  const { demoMode } = useSession();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(SEEN_KEY) === "true");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!demoMode || dismissed) return null;

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "true");
    setDismissed(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    api.submitDemoEmail(email).finally(dismiss);
  }

  return (
    <Modal onClose={dismiss}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 320 }}>
        <h2 style={{ margin: 0 }}>{t("demo.emailGate.heading")}</h2>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("demo.emailGate.hint")}</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("demo.emailGate.placeholder")}
          autoFocus
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={dismiss}>
            {t("demo.emailGate.skip")}
          </button>
          <button type="submit" disabled={submitting || !email}>
            {t("demo.emailGate.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
