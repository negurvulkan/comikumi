import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { setAuthToken } from "../api/authFetch";
import { translateApiError } from "../i18n/translateApiError";

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(username.trim(), password);
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
        <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{t("login.heading")}</p>
        {error && <div className="error-banner">{error}</div>}
        <label>
          {t("login.usernameLabel")}
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>
        <label>
          {t("login.passwordLabel")}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? t("common.loading") : t("login.submitButton")}
        </button>
      </form>
    </div>
  );
}
