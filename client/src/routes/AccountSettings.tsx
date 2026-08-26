import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";

interface AIProviderStatus {
  openai: { configured: boolean };
  codex: { configured: boolean; planType?: string; usedPercent?: number };
}

interface CodexLoginState {
  loginId: string;
  userCode: string;
  verificationUrl: string;
}

/** Opens a URL in the user's real default browser under Electron (via preload.ts's
 * contextBridge, see the electron-packaging branch) — a plain link would otherwise
 * open a confusing second window in this app's own embedded Chromium for what's meant
 * to be an external sign-in step. Falls back to a normal new tab on the web build,
 * where `window.comikumi` doesn't exist at all. */
function openExternal(url: string): void {
  const bridge = (window as { comikumi?: { openExternal?: (url: string) => void } }).comikumi;
  if (bridge?.openExternal) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/** Account-level settings — deliberately outside any project (`/account`, not
 * `/p/:projectId/...`), since AI-provider configuration belongs to the logged-in
 * person, not to a project (see the multi-provider-assistant plan: "kein projekt-
 * oder instanzweites An/Aus"). Every ComiKumi account configures/owns its own
 * provider credentials independently. */
export function AccountSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AIProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [codexLogin, setCodexLogin] = useState<CodexLoginState | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function refreshStatus() {
    api.getAIProviderStatus().then(setStatus).catch((err) => setError(translateApiError(err, t)));
  }

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function handleSetOpenAIKey(e: React.FormEvent) {
    e.preventDefault();
    if (!openaiKeyInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.setOpenAIKey(openaiKeyInput.trim());
      setOpenaiKeyInput("");
      refreshStatus();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearOpenAIKey() {
    setBusy(true);
    setError(null);
    try {
      await api.clearOpenAIKey();
      refreshStatus();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartCodexLogin() {
    setBusy(true);
    setError(null);
    try {
      const start = await api.startCodexLogin();
      setCodexLogin(start);
      pollTimer.current = setInterval(async () => {
        const poll = await api.pollCodexLoginStatus();
        if (!poll || poll.status === "pending") return;
        if (pollTimer.current) clearInterval(pollTimer.current);
        setCodexLogin(null);
        if (poll.status === "error") setError(poll.error ?? t("account.codexLoginFailed"));
        refreshStatus();
      }, 2000);
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelCodexLogin() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    setCodexLogin(null);
    await api.cancelCodexLogin().catch(() => {});
  }

  async function handleLogoutCodex() {
    setBusy(true);
    setError(null);
    try {
      await api.logoutCodex();
      refreshStatus();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-padded">
      <div className="page-scroll">
        <Link to="/project" style={{ display: "inline-block", marginBottom: 12 }}>
          {t("account.backLink")}
        </Link>
        <h2 style={{ margin: "0 0 12px" }}>{t("account.title")}</h2>
        {error && <div className="error-banner">{error}</div>}

        <div className="inspector" style={{ maxWidth: 480, marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>OpenAI</p>
          {status?.openai.configured ? (
            <>
              <p className="hint" style={{ margin: 0 }}>
                {t("account.openaiConfigured")}
              </p>
              <button type="button" onClick={handleClearOpenAIKey} disabled={busy}>
                {t("account.clearKey")}
              </button>
            </>
          ) : (
            <form onSubmit={handleSetOpenAIKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label>
                {t("account.openaiKeyLabel")}
                <input
                  type="password"
                  value={openaiKeyInput}
                  onChange={(e) => setOpenaiKeyInput(e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="primary" disabled={busy || !openaiKeyInput.trim()}>
                {t("account.saveKey")}
              </button>
            </form>
          )}
        </div>

        <div className="inspector" style={{ maxWidth: 480 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Codex (ChatGPT)</p>
          {status?.codex.configured ? (
            <>
              <p className="hint" style={{ margin: 0 }}>
                {t("account.codexConfigured")}
                {status.codex.planType && ` — ${status.codex.planType}`}
                {typeof status.codex.usedPercent === "number" && ` (${Math.round(status.codex.usedPercent)}% ${t("account.usedPercentSuffix")})`}
              </p>
              <button type="button" onClick={handleLogoutCodex} disabled={busy}>
                {t("account.codexSignOut")}
              </button>
            </>
          ) : codexLogin ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ margin: 0 }}>{t("account.codexEnterCode")}</p>
              <p style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>{codexLogin.userCode}</p>
              <button type="button" onClick={() => openExternal(codexLogin.verificationUrl)} style={{ textAlign: "left" }}>
                {codexLogin.verificationUrl}
              </button>
              <p className="hint" style={{ margin: 0 }}>{t("account.codexWaiting")}</p>
              <button type="button" onClick={handleCancelCodexLogin}>
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button type="button" className="primary" onClick={handleStartCodexLogin} disabled={busy}>
              {t("account.codexSignIn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
