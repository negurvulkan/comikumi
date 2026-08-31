import type { ChatRequest } from "./types.js";

type OpenAIMessage = { role: string; content: string | { type: string; text?: string; image_url?: { url: string } }[] };

function toOpenAIMessages(request: ChatRequest): OpenAIMessage[] {
  const messages: OpenAIMessage[] = request.messages.map((m) => ({ role: m.role, content: m.content }));
  if (request.contextText && request.contextImage) {
    messages.unshift({
      role: "system",
      content: [
        { type: "text", text: `Projekt-Kontext:\n${request.contextText}` },
        { type: "image_url", image_url: { url: request.contextImage } },
      ],
    });
  } else if (request.contextText) {
    messages.unshift({ role: "system", content: `Projekt-Kontext:\n${request.contextText}` });
  } else if (request.contextImage) {
    messages.unshift({ role: "system", content: [{ type: "image_url", image_url: { url: request.contextImage } }] });
  }
  return messages;
}

/** Parses an OpenAI-style SSE stream (`data: {...}\n\n`, terminated by `data: [DONE]`)
 * into plain text deltas — the exact wire shape routes/ai.ts re-emits to the browser,
 * so the client never needs to know which provider produced them. */
async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
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
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string") yield delta;
        } catch {
          // Skip malformed/keep-alive lines rather than aborting the whole stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface OpenAICompatibleOptions {
  /** e.g. "https://api.openai.com/v1" — the chat completions endpoint is this plus
   * "/chat/completions". */
  baseUrl: string;
  /** Omit for a server that doesn't need auth at all (e.g. a local Ollama instance). */
  apiKey?: string;
  model: string;
  /** Provider-specific extras beyond Content-Type/Authorization — e.g. OpenRouter's
   * recommended HTTP-Referer/X-Title headers. */
  extraHeaders?: Record<string, string>;
}

/** Shared request-building + SSE-parsing for every provider that speaks the OpenAI
 * Chat Completions wire format verbatim — currently openaiProvider.ts itself,
 * openrouterProvider.ts, and ollamaProvider.ts (Ollama exposes an OpenAI-compatible
 * `/v1/chat/completions` route). Only the base URL, auth header, and model name
 * differ between them; extracting this once avoids three near-identical copies of
 * `toOpenAIMessages`/`parseSse`. */
export async function* openaiCompatibleChat(opts: OpenAICompatibleOptions, request: ChatRequest): AsyncIterable<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...opts.extraHeaders };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: opts.model, stream: true, messages: toOpenAIMessages(request) }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`openai_compatible_request_failed: ${res.status} ${text}`);
  }
  yield* parseSse(res.body);
}
