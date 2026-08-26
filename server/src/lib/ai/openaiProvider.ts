import { getDecryptedOpenAIKey } from "../authStore.js";
import type { AIProvider, ChatRequest } from "./types.js";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
// A small, inexpensive default — fine for a conversational writing aid; not
// user-configurable yet (see the plan's "Nicht in diesem Umfang" section).
const DEFAULT_MODEL = "gpt-4o-mini";

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

export const openaiProvider: AIProvider = {
  id: "openai",
  async *streamChat(userId, request) {
    const apiKey = await getDecryptedOpenAIKey(userId);
    if (!apiKey) throw new Error("openai_not_configured");

    const res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: DEFAULT_MODEL, stream: true, messages: toOpenAIMessages(request) }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`openai_request_failed: ${res.status} ${text}`);
    }
    yield* parseSse(res.body);
  },
};
