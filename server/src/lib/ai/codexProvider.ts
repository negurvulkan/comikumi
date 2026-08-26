import type { AIProvider, ChatRequest } from "./types.js";
import { streamCodexChat } from "./codexProcessManager.js";

/** Folds the conversation + optional selected-context text into one prompt string —
 * Codex threads don't take a `messages[]` array the way Chat Completions APIs do
 * (see codexProcessManager.ts's streamCodexChat(), whose `turn/start` input is a
 * single text item), so history is flattened here instead of forwarded structurally.
 * Fine for v1's short-lived, un-persisted conversations. */
function buildPrompt(request: ChatRequest): string {
  const parts: string[] = [];
  if (request.contextText) parts.push(`Kontext:\n${request.contextText}`);
  for (const message of request.messages) {
    const label = message.role === "user" ? "Nutzer" : message.role === "assistant" ? "Assistent" : "System";
    parts.push(`${label}: ${message.content}`);
  }
  return parts.join("\n\n");
}

export const codexProvider: AIProvider = {
  id: "codex",
  streamChat(userId, request) {
    return streamCodexChat(userId, buildPrompt(request), request.contextImage);
  },
};
