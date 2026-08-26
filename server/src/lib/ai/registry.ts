import type { AIProvider } from "./types.js";
import { openaiProvider } from "./openaiProvider.js";
import { codexProvider } from "./codexProvider.js";

const providers: Record<string, AIProvider> = {
  openai: openaiProvider,
  codex: codexProvider,
};

export function getAIProvider(providerId: string): AIProvider | undefined {
  return providers[providerId];
}
