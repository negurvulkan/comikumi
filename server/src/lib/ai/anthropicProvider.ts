import { getDecryptedAnthropicKey } from "../authStore.js";
import type { AIProvider, ChatRequest } from "./types.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Fast/cheap default, same reasoning as openaiProvider.ts's DEFAULT_MODEL.
const DEFAULT_MODEL = "claude-3-5-haiku-20241022";
const MAX_TOKENS = 4096;

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicContentBlock[] };

/** Splits a "data:<mime>;base64,<data>" URI (the shape AIPanel.tsx builds
 * client-side for `contextImage`) into Anthropic's separate media_type/data fields —
 * unlike OpenAI's `image_url.url`, which takes the whole data URI verbatim. */
function splitDataUri(dataUri: string): { mediaType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUri);
  if (!match) throw new Error("invalid_context_image_data_uri");
  return { mediaType: match[1], data: match[2] };
}

/** Anthropic has no "system" role inside `messages[]` — unlike OpenAI, system framing
 * is a separate top-level `system` string. Any stray system-role entries in
 * `request.messages` (the app itself never sends any today, but the type allows it)
 * are folded into that same string rather than dropped. `contextImage` becomes an
 * image content block prepended to the first user message (creating one if the
 * conversation somehow has none yet). */
function toAnthropicRequest(request: ChatRequest): { system?: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  if (request.contextText) systemParts.push(`Projekt-Kontext:\n${request.contextText}`);

  const messages: AnthropicMessage[] = [];
  for (const m of request.messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    messages.push({ role: m.role, content: m.content });
  }

  if (request.contextImage) {
    const { mediaType, data } = splitDataUri(request.contextImage);
    const imageBlock: AnthropicContentBlock = { type: "image", source: { type: "base64", media_type: mediaType, data } };
    const firstUserIndex = messages.findIndex((m) => m.role === "user");
    if (firstUserIndex === -1) {
      messages.unshift({ role: "user", content: [imageBlock] });
    } else {
      const target = messages[firstUserIndex];
      const existingBlocks: AnthropicContentBlock[] = typeof target.content === "string" ? [{ type: "text", text: target.content }] : target.content;
      messages[firstUserIndex] = { ...target, content: [imageBlock, ...existingBlocks] };
    }
  }

  return { system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, messages };
}

/** Anthropic's SSE stream carries several event kinds (message_start,
 * content_block_start, ping, content_block_delta, content_block_stop, message_delta,
 * message_stop) — each `data:` line's own JSON `type` field already names its kind
 * (mirrored by the `event:` line, so parsing just the JSON is enough), only
 * `content_block_delta` with a `text_delta` inner type carries actual text. */
async function* parseAnthropicSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
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
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && typeof parsed.delta.text === "string") {
            yield parsed.delta.text;
          }
        } catch {
          // Skip malformed/keep-alive lines rather than aborting the whole stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const anthropicProvider: AIProvider = {
  id: "anthropic",
  async *streamChat(userId, request) {
    const apiKey = await getDecryptedAnthropicKey(userId);
    if (!apiKey) throw new Error("anthropic_not_configured");

    const { system, messages } = toAnthropicRequest(request);
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({ model: DEFAULT_MODEL, max_tokens: MAX_TOKENS, system, messages, stream: true }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`anthropic_request_failed: ${res.status} ${text}`);
    }
    yield* parseAnthropicSse(res.body);
  },
};
