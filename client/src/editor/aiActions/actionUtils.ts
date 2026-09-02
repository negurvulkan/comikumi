/** Text the streaming response is checked against to switch the UI from live text to a
 * "preparing a suggestion" placeholder — see AIPanel.tsx. Matches the fence opener every
 * action prompt (see the individual aiXxxAction.ts files) instructs the model to use; a
 * plain ``` (no "json") or any prose before it means this isn't an action response. */
export const ACTION_FENCE_PREFIX = "```json";

/** Extracts and JSON.parses the first ```json fenced block in `rawText` — shared by
 * every action's own parseXxxAction() so the "find the fence, parse it, give up quietly
 * on malformed JSON" logic (which every action needs identically) isn't repeated once
 * per action. Returns `null` for anything that isn't a well-formed fenced JSON block
 * (plain chat text, no fence, or invalid JSON inside one) — never throws. */
export function extractJsonFence(rawText: string): unknown | null {
  const match = rawText.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
