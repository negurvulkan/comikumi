import { getOllamaConfig } from "../authStore.js";
import type { AIProvider } from "./types.js";
import { openaiCompatibleChat } from "./openaiCompatibleChat.js";

export const ollamaProvider: AIProvider = {
  id: "ollama",
  async *streamChat(userId, request) {
    const config = await getOllamaConfig(userId);
    if (!config) throw new Error("ollama_not_configured");
    // Ollama exposes an OpenAI-compatible surface at <baseUrl>/v1/chat/completions —
    // reuses the same request/SSE logic as openaiProvider.ts/openrouterProvider.ts.
    // No apiKey: Ollama's OpenAI-compatible route doesn't check auth at all (a
    // deliberately unauthenticated local/self-hosted server — see this provider's
    // AccountSettings.tsx reachability hint: the ComiKumi SERVER must be able to
    // reach this URL, not the user's browser).
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    yield* openaiCompatibleChat({ baseUrl: `${baseUrl}/v1`, model: config.model }, request);
  },
};
