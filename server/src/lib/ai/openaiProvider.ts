import { getDecryptedOpenAIKey } from "../authStore.js";
import type { AIProvider } from "./types.js";
import { openaiCompatibleChat } from "./openaiCompatibleChat.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
// A small, inexpensive default — fine for a conversational writing aid; not
// user-configurable yet (see the plan's "Nicht in diesem Umfang" section).
const DEFAULT_MODEL = "gpt-4o-mini";

export const openaiProvider: AIProvider = {
  id: "openai",
  async *streamChat(userId, request) {
    const apiKey = await getDecryptedOpenAIKey(userId);
    if (!apiKey) throw new Error("openai_not_configured");
    yield* openaiCompatibleChat({ baseUrl: OPENAI_BASE_URL, apiKey, model: DEFAULT_MODEL }, request);
  },
};
