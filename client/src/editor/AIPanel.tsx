import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Marked } from "marked";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useResizableSidebarWidth } from "./useResizableSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — same convention as
   * every other `.text-sidebar` panel (see StoryBiblePanel.tsx). */
  open: boolean;
  onClose: () => void;
  /** Short human label for what `contextText` represents (e.g. "aktuelle Blase",
   * "aktuelle Seite") — shown next to the include-context checkbox. Omit both props
   * entirely when the host screen has no natural context to offer. */
  contextLabel?: string;
  contextText?: string;
  /** Same-origin URL of the current page's image (e.g. `api.pageImageUrl(...)`) — sent
   * alongside `contextText` so the model can see silent/action panels that carry no
   * bubble text. This is the raw, un-lettered background scan — no bubbles/text baked
   * in. Omitted by hosts with no page image (e.g. the script editor, which has no
   * artwork yet). */
  contextImageUrl?: string;
  /** Lazily renders the current page WITH lettering (bubbles/text/curved text) baked
   * in — the same pipeline the export feature uses (see renderPageToPng.ts) — so the
   * model can judge actual typesetting (overflow, cramped lines, alignment) instead of
   * just the bare background. Only invoked when the user enables "send rendered page"
   * and actually sends a message, since rendering is comparatively expensive (loads
   * fonts/placed images). Omitted wherever `contextImageUrl` is omitted. */
  contextRenderedImage?: () => Promise<Blob>;
}

/** Downscales a blob to at most `maxDim` px on its longest edge and re-encodes it as a
 * JPEG data URI — keeps the base64 payload small (both for the request body and for
 * the provider's own vision-token cost) without needing a dedicated server-side resize
 * endpoint. */
async function downscaleBlobToDataUrl(blob: Blob, maxDim = 1280): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_context_unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Same-origin fetch, so no canvas-tainting concerns. */
async function fetchAndDownscaleToDataUrl(url: string, maxDim = 1280): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image_fetch_failed: ${res.status}`);
  return downscaleBlobToDataUrl(await res.blob(), maxDim);
}

type ProviderId = "openai" | "codex" | "anthropic" | "google" | "openrouter" | "ollama";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Markdown → HTML with raw-HTML passthrough disabled and only http(s) links allowed —
 * assistant replies are model output, not authored HTML, so this is treated as
 * untrusted input rather than trusted markdown (no DOMPurify dependency needed for
 * just these two passthrough vectors). */
const safeMarked = new Marked({
  renderer: {
    html(): string {
      return "";
    },
    link({ href, title, tokens }): string {
      const text = this.parser.parseInline(tokens);
      if (!/^https?:\/\//i.test(href)) return text;
      const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
      return `<a href="${href.replace(/"/g, "&quot;")}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/** Read-only-conversation AI assistant panel — same `.text-sidebar` scaffolding as
 * StoryBiblePanel.tsx, mountable identically from Editor.tsx and ScriptEditor.tsx.
 * Provider-agnostic: the server normalizes OpenAI/Codex into the same SSE wire format
 * (see server/src/routes/ai.ts), so this component never needs to know which one it's
 * talking to beyond the id the user picked. */
export function AIPanel({ open, onClose, contextLabel, contextText, contextImageUrl, contextRenderedImage }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resize = useResizableSidebarWidth();

  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, boolean> | null>(null);
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [includeContext, setIncludeContext] = useState(true);
  const [useRenderedContext, setUseRenderedContext] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api
      .getAIProviderStatus()
      .then((status) => {
        const next: Record<ProviderId, boolean> = {
          openai: status.openai.configured,
          codex: status.codex.configured,
          anthropic: status.anthropic.configured,
          google: status.google.configured,
          openrouter: status.openrouter.configured,
          ollama: status.ollama.configured,
        };
        setProviderStatus(next);
        // First configured provider wins as the default — OpenAI/Codex checked first
        // for existing-user continuity, the four newer providers in registration order.
        setProviderId(
          (current) => current ?? ((Object.keys(next) as ProviderId[]).find((id) => next[id]) ?? null)
        );
      })
      .catch((err) => setError(translateApiError(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const hasAnyProvider = providerStatus ? Object.values(providerStatus).some(Boolean) : false;

  const renderedMessages = useMemo(
    () => messages.map((m) => ({ ...m, html: m.role === "assistant" ? safeMarked.parse(m.content) : null })),
    [messages]
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || !input.trim() || busy) return;
    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      let contextImage: string | undefined;
      if (includeContext && useRenderedContext && contextRenderedImage) {
        // Best-effort, same fallback rationale as the raw-image branch below — a render
        // failure (e.g. a missing placed-image file) shouldn't block the whole question.
        contextImage = await contextRenderedImage()
          .then((blob) => downscaleBlobToDataUrl(blob))
          .catch(() => undefined);
      } else if (includeContext && contextImageUrl) {
        // Best-effort: a failed fetch/encode (network hiccup, etc.) shouldn't block the
        // whole question — just fall back to sending the text context alone, same as
        // contextText already being optional.
        contextImage = await fetchAndDownscaleToDataUrl(contextImageUrl).catch(() => undefined);
      }
      const res = await api.sendAIChat({
        providerId,
        messages: nextMessages,
        contextText: includeContext ? contextText : undefined,
        contextImage,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice("data:".length).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { delta?: string; error?: string };
            if (parsed.error) {
              setError(parsed.error);
              continue;
            }
            if (parsed.delta) {
              assistantText += parsed.delta;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: assistantText };
                return next;
              });
            }
          } catch {
            // Ignore malformed SSE lines rather than aborting the whole render.
          }
        }
      }
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`text-sidebar${open ? " open" : ""}`} style={{ width: open ? resize.width : undefined }}>
      <SidebarResizeHandle
        dragging={resize.dragging}
        onPointerDown={resize.handlePointerDown}
        onPointerMove={resize.handlePointerMove}
        onPointerUp={resize.handlePointerUp}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.aiPanel.title")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {providerStatus && !hasAnyProvider && (
        <p className="hint">
          {t("editor.aiPanel.noProviderConfigured")}{" "}
          <button type="button" onClick={() => navigate("/account")} style={{ padding: 0 }}>
            {t("editor.aiPanel.configureLink")}
          </button>
        </p>
      )}

      {hasAnyProvider && (
        <>
          <select value={providerId ?? ""} onChange={(e) => setProviderId(e.target.value as ProviderId)}>
            {providerStatus?.openai && <option value="openai">OpenAI</option>}
            {providerStatus?.codex && <option value="codex">Codex</option>}
            {providerStatus?.anthropic && <option value="anthropic">Anthropic (Claude)</option>}
            {providerStatus?.google && <option value="google">Google (Gemini)</option>}
            {providerStatus?.openrouter && <option value="openrouter">OpenRouter</option>}
            {providerStatus?.ollama && <option value="ollama">Ollama</option>}
          </select>

          {contextText !== undefined && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} />
              {t("editor.aiPanel.includeContext", { label: contextLabel ?? t("editor.aiPanel.defaultContextLabel") })}
            </label>
          )}

          {includeContext && contextRenderedImage && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={useRenderedContext} onChange={(e) => setUseRenderedContext(e.target.checked)} />
              {t("editor.aiPanel.useRenderedContext")}
            </label>
          )}

          <div ref={scrollRef} className="sidebar-scroll-body">
            {renderedMessages.length === 0 && <p className="hint">{t("editor.aiPanel.empty")}</p>}
            {renderedMessages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} style={{ margin: 0, fontWeight: 600, whiteSpace: "pre-wrap" }}>
                  {m.content}
                </p>
              ) : (
                // eslint-disable-next-line react/no-danger
                <div key={i} style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: m.html ?? "" }} />
              )
            )}
          </div>

          <form onSubmit={handleSend} style={{ display: "flex", gap: 6 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("editor.aiPanel.inputPlaceholder")}
              style={{ minHeight: 44, flex: "1 1 auto" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            <button type="submit" className="primary" disabled={busy || !input.trim()}>
              {t("editor.aiPanel.send")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
