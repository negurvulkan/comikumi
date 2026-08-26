export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Already-fetched, role-checked project context the client put together locally
   * (see docs on server/src/routes/ai.ts) — plain text, prepended as a system-ish
   * framing message. Optional since a plain question needs none. */
  contextText?: string;
  /** The current page, as a data URI (e.g. "data:image/jpeg;base64,...") — the client
   * already downscales/encodes it (see AIPanel.tsx) before it ever reaches here, so
   * providers only need to forward it. Optional: not every host screen has a page
   * image (e.g. the script editor, which has no artwork yet). */
  contextImage?: string;
}

/** A provider's job is just "take a conversation, stream text deltas back" — kept
 * deliberately minimal for this first version (no tool-calling, no structured output).
 * Both concrete providers (openaiProvider.ts: a stateless HTTPS call; codexProvider.ts:
 * a long-lived per-user subprocess with thread/turn state) implement the exact same
 * shape, so routes/ai.ts never needs to know which one it's talking to. */
export interface AIProvider {
  id: string;
  streamChat(userId: string, request: ChatRequest): AsyncIterable<string>;
}
