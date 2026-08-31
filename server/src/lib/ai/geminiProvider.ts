import { getDecryptedGoogleKey } from "../authStore.js";
import type { AIProvider, ChatRequest } from "./types.js";

// Fast/cheap default, same reasoning as openaiProvider.ts's DEFAULT_MODEL.
const DEFAULT_MODEL = "gemini-2.0-flash";

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

/** Splits a "data:<mime>;base64,<data>" URI into Gemini's separate mime_type/data
 * fields — same reasoning as anthropicProvider.ts's splitDataUri. */
function splitDataUri(dataUri: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUri);
  if (!match) throw new Error("invalid_context_image_data_uri");
  return { mimeType: match[1], data: match[2] };
}

/** Gemini uses "user"/"model" roles (not "assistant") and has no "system" role in
 * `contents[]` at all — system framing is a separate `systemInstruction` field, same
 * shape reasoning as anthropicProvider.ts's `system` string. `contextImage` becomes
 * an `inline_data` part appended to the LAST user turn (Gemini expects image parts
 * alongside the question they illustrate, not necessarily the first turn). */
function toGeminiRequest(request: ChatRequest): { systemInstruction?: { parts: [{ text: string }] }; contents: GeminiContent[] } {
  const systemParts: string[] = [];
  if (request.contextText) systemParts.push(`Projekt-Kontext:\n${request.contextText}`);

  const contents: GeminiContent[] = [];
  for (const m of request.messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }

  if (request.contextImage) {
    const { mimeType, data } = splitDataUri(request.contextImage);
    const imagePart: GeminiPart = { inline_data: { mime_type: mimeType, data } };
    const lastUserIndex = [...contents].reverse().findIndex((c) => c.role === "user");
    if (lastUserIndex === -1) {
      contents.push({ role: "user", parts: [imagePart] });
    } else {
      const index = contents.length - 1 - lastUserIndex;
      contents[index] = { ...contents[index], parts: [...contents[index].parts, imagePart] };
    }
  }

  return {
    systemInstruction: systemParts.length > 0 ? { parts: [{ text: systemParts.join("\n\n") }] } : undefined,
    contents,
  };
}

/** Gemini's `alt=sse` stream carries one full GenerateContentResponse JSON per
 * `data:` line (not an incremental delta shape like OpenAI/Anthropic) — each line's
 * `candidates[0].content.parts[]` is the text produced so far in THIS chunk (already
 * a delta relative to the previous chunk, despite the full-response shape). */
async function* parseGeminiSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
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
          const parts = parsed.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (typeof part.text === "string") yield part.text;
            }
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

export const geminiProvider: AIProvider = {
  id: "google",
  async *streamChat(userId, request) {
    const apiKey = await getDecryptedGoogleKey(userId);
    if (!apiKey) throw new Error("google_not_configured");

    const { systemInstruction, contents } = toGeminiRequest(request);
    // Key goes in the query string — Google's REST API convention, unlike every other
    // provider here (all header-based auth).
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`google_request_failed: ${res.status} ${text}`);
    }
    yield* parseGeminiSse(res.body);
  },
};
