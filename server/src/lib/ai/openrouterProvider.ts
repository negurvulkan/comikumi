import { getDecryptedOpenRouterKey } from "../authStore.js";
import type { AIProvider } from "./types.js";
import { openaiCompatibleChat } from "./openaiCompatibleChat.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
// A well-known, inexpensive OpenRouter-routed model id — same "small/cheap default,
// not user-configurable yet" reasoning as openaiProvider.ts's DEFAULT_MODEL.
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export const openrouterProvider: AIProvider = {
  id: "openrouter",
  async *streamChat(userId, request) {
    const apiKey = await getDecryptedOpenRouterKey(userId);
    if (!apiKey) throw new Error("openrouter_not_configured");
    yield* openaiCompatibleChat(
      {
        baseUrl: OPENROUTER_BASE_URL,
        apiKey,
        model: DEFAULT_MODEL,
        // OpenRouter's own convention (not strictly required, but recommended — helps
        // their abuse detection and shows up in their public leaderboard attribution).
        extraHeaders: { "HTTP-Referer": "https://github.com/negurvulkan/comikumi", "X-Title": "ComiKumi" },
      },
      request
    );
  },
};
