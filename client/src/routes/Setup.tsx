import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { setAuthToken } from "../api/authFetch";
import { translateApiError } from "../i18n/translateApiError";

/** Shown instead of /login while the server has zero accounts yet (see
 * SessionContext.tsx's redirect logic) — the account created here becomes
 * isSystemAdmin (see shared/src/users.ts), so it has full access to every existing
 * project immediately, no manual migration needed. Mirrors ProjectWizard.tsx's single-
 * form-step shape rather than that screen's full multi-step flow — there's only one
 * thing to decide here. */
export function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t("setup.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.setupAccount(username.trim(), password);
      setAuthToken(token);
      navigate("/", { replace: true });
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-padded" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
      <form onSubmit={handleSubmit} className="inspector" style={{ maxWidth: 360, width: "100%" }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{t("setup.heading")}</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{t("setup.hint")}</p>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t("login.usernameLabel")}
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>
        <label>
          {t("login.passwordLabel")}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          {t("setup.confirmPasswordLabel")}
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? t("common.loading") : t("setup.submitButton")}
        </button>
      </form>
    </div>
  );
}
