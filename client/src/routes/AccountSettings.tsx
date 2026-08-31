import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";

interface AIProviderStatus {
  openai: { configured: boolean };
  codex: { configured: boolean; planType?: string; usedPercent?: number };
  anthropic: { configured: boolean };
  google: { configured: boolean };
  openrouter: { configured: boolean };
  ollama: { configured: boolean; baseUrl?: string; model?: string };
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

/** One "paste an API key, save/clear it" block — the shape shared by OpenAI/
 * Anthropic/Google/OpenRouter (four identical-shaped forms once the fourth provider
 * arrived, past the point where copy-pasting a fifth ~25-line block was still the
 * simpler option). Codex keeps its own bespoke OAuth-flow markup below since it isn't
 * a key at all. */
function ApiKeyProviderBlock({
  label,
  configured,
  configuredHint,
  keyLabel,
  value,
  onChange,
  onSave,
  onClear,
  busy,
}: {
  label: string;
  configured: boolean;
  configuredHint: string;
  keyLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSave: (e: React.FormEvent) => void;
  onClear: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="inspector" style={{ maxWidth: 480, marginBottom: 16 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{label}</p>
      {configured ? (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {configuredHint}
          </p>
          <button type="button" onClick={onClear} disabled={busy}>
            {t("account.clearKey")}
          </button>
        </>
      ) : (
        <form onSubmit={onSave} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            {keyLabel}
            <input type="password" value={value} onChange={(e) => onChange(e.target.value)} placeholder="sk-…" autoComplete="off" />
          </label>
          <button type="submit" className="primary" disabled={busy || !value.trim()}>
            {t("account.saveKey")}
          </button>
        </form>
      )}
    </div>
  );
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
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");
  const [googleKeyInput, setGoogleKeyInput] = useState("");
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState("");
  const [ollamaBaseUrlInput, setOllamaBaseUrlInput] = useState("");
  const [ollamaModelInput, setOllamaModelInput] = useState("");
  const [codexLogin, setCodexLogin] = useState<CodexLoginState | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function refreshStatus() {
    api
      .getAIProviderStatus()
      .then((s) => {
        setStatus(s);
        setOllamaBaseUrlInput(s.ollama.baseUrl ?? "");
        setOllamaModelInput(s.ollama.model ?? "");
      })
      .catch((err) => setError(translateApiError(err, t)));
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

  /** Generic save/clear handler pair for a key-based provider — takes that provider's
   * own api.set<X>Key/clear<X>Key functions and its input-reset callback, so this one
   * factory backs all four ApiKeyProviderBlock instances below instead of four
   * near-identical handler pairs. */
  function makeKeyHandlers(setKey: (key: string) => Promise<unknown>, clearKey: () => Promise<unknown>, resetInput: () => void) {
    return {
      async save(e: React.FormEvent, value: string) {
        e.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        setError(null);
        try {
          await setKey(value.trim());
          resetInput();
          refreshStatus();
        } catch (err) {
          setError(translateApiError(err, t));
        } finally {
          setBusy(false);
        }
      },
      async clear() {
        setBusy(true);
        setError(null);
        try {
          await clearKey();
          refreshStatus();
        } catch (err) {
          setError(translateApiError(err, t));
        } finally {
          setBusy(false);
        }
      },
    };
  }

  const openaiHandlers = makeKeyHandlers(api.setOpenAIKey, api.clearOpenAIKey, () => setOpenaiKeyInput(""));
  const anthropicHandlers = makeKeyHandlers(api.setAnthropicKey, api.clearAnthropicKey, () => setAnthropicKeyInput(""));
  const googleHandlers = makeKeyHandlers(api.setGoogleKey, api.clearGoogleKey, () => setGoogleKeyInput(""));
  const openrouterHandlers = makeKeyHandlers(api.setOpenRouterKey, api.clearOpenRouterKey, () => setOpenrouterKeyInput(""));

  async function handleSaveOllamaConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!ollamaBaseUrlInput.trim() || !ollamaModelInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.setOllamaConfig({ baseUrl: ollamaBaseUrlInput.trim(), model: ollamaModelInput.trim() });
      refreshStatus();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleClearOllamaConfig() {
    setBusy(true);
    setError(null);
    try {
      await api.clearOllamaConfig();
      setOllamaBaseUrlInput("");
      setOllamaModelInput("");
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

        <ApiKeyProviderBlock
          label="OpenAI"
          configured={!!status?.openai.configured}
          configuredHint={t("account.openaiConfigured")}
          keyLabel={t("account.openaiKeyLabel")}
          value={openaiKeyInput}
          onChange={setOpenaiKeyInput}
          onSave={(e) => openaiHandlers.save(e, openaiKeyInput)}
          onClear={openaiHandlers.clear}
          busy={busy}
        />

        <ApiKeyProviderBlock
          label="Anthropic (Claude)"
          configured={!!status?.anthropic.configured}
          configuredHint={t("account.anthropicConfigured")}
          keyLabel={t("account.anthropicKeyLabel")}
          value={anthropicKeyInput}
          onChange={setAnthropicKeyInput}
          onSave={(e) => anthropicHandlers.save(e, anthropicKeyInput)}
          onClear={anthropicHandlers.clear}
          busy={busy}
        />

        <ApiKeyProviderBlock
          label="Google (Gemini)"
          configured={!!status?.google.configured}
          configuredHint={t("account.googleConfigured")}
          keyLabel={t("account.googleKeyLabel")}
          value={googleKeyInput}
          onChange={setGoogleKeyInput}
          onSave={(e) => googleHandlers.save(e, googleKeyInput)}
          onClear={googleHandlers.clear}
          busy={busy}
        />

        <ApiKeyProviderBlock
          label="OpenRouter"
          configured={!!status?.openrouter.configured}
          configuredHint={t("account.openrouterConfigured")}
          keyLabel={t("account.openrouterKeyLabel")}
          value={openrouterKeyInput}
          onChange={setOpenrouterKeyInput}
          onSave={(e) => openrouterHandlers.save(e, openrouterKeyInput)}
          onClear={openrouterHandlers.clear}
          busy={busy}
        />

        <div className="inspector" style={{ maxWidth: 480, marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Ollama</p>
          <p className="hint" style={{ margin: 0 }}>
            {t("account.ollamaReachabilityHint")}
          </p>
          <form onSubmit={handleSaveOllamaConfig} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>
              {t("account.ollamaBaseUrlLabel")}
              <input
                type="text"
                value={ollamaBaseUrlInput}
                onChange={(e) => setOllamaBaseUrlInput(e.target.value)}
                placeholder="http://localhost:11434"
                autoComplete="off"
              />
            </label>
            <label>
              {t("account.ollamaModelLabel")}
              <input
                type="text"
                value={ollamaModelInput}
                onChange={(e) => setOllamaModelInput(e.target.value)}
                placeholder="llama3.2"
                autoComplete="off"
              />
            </label>
            <div className="field-row">
              <button type="submit" className="primary" disabled={busy || !ollamaBaseUrlInput.trim() || !ollamaModelInput.trim()}>
                {t("account.saveOllamaConfig")}
              </button>
              {status?.ollama.configured && (
                <button type="button" onClick={handleClearOllamaConfig} disabled={busy}>
                  {t("account.clearOllamaConfig")}
                </button>
              )}
            </div>
          </form>
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
