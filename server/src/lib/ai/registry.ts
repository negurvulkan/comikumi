import type { AIProvider } from "./types.js";
import { openaiProvider } from "./openaiProvider.js";
import { codexProvider } from "./codexProvider.js";
import { anthropicProvider } from "./anthropicProvider.js";
import { geminiProvider } from "./geminiProvider.js";
import { openrouterProvider } from "./openrouterProvider.js";
import { ollamaProvider } from "./ollamaProvider.js";

const providers: Record<string, AIProvider> = {
  openai: openaiProvider,
  codex: codexProvider,
  anthropic: anthropicProvider,
  google: geminiProvider,
  openrouter: openrouterProvider,
  ollama: ollamaProvider,
};

export function getAIProvider(providerId: string): AIProvider | undefined {
  return providers[providerId];
}
