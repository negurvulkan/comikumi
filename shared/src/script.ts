import { z } from "zod";

/**
 * Independent planning-stage data model for a volume's script — plot, rough
 * panel layout, image composition, and dialogue, all written before (or
 * alongside) the actual scanned artwork exists. Deliberately unrelated to
 * PageLayout/Panel/Bubble in layoutSchema.ts, which are pixel-geometry
 * annotations on an already-scanned page image — a script page has no
 * corresponding image at all yet, so it can't reuse that geometry.
 */
export const ScriptPanelSizeSchema = z.enum(["small", "medium", "large"]);
export type ScriptPanelSize = z.infer<typeof ScriptPanelSizeSchema>;

export const ScriptDialogueLineSchema = z.object({
  id: z.string(),
  /** Reference into the project's Character list (shared/src/characters.ts) — same
   * "stale id = unassigned" convention as Bubble.characterId, no special handling
   * needed if a character is later deleted. */
  characterId: z.string().nullable().default(null),
  /** Same convention as Bubble.text — one entry per project language code, so a
   * dialogue line can be copied straight into whichever language tab is active
   * in the page editor's BubbleInspector. */
  text: z.record(z.string(), z.string()).default({}),
  /** Freeform direction note, e.g. "off-panel", "mumbled". */
  note: z.string().default(""),
});
export type ScriptDialogueLine = z.infer<typeof ScriptDialogueLineSchema>;

export const ScriptPanelSchema = z.object({
  id: z.string(),
  sizeHint: ScriptPanelSizeSchema.default("medium"),
  /** Image composition — what's depicted, camera angle/framing. */
  composition: z.string().default(""),
  /** Plot/action — what happens in this panel. */
  action: z.string().default(""),
  dialogue: z.array(ScriptDialogueLineSchema).default([]),
});
export type ScriptPanel = z.infer<typeof ScriptPanelSchema>;

export const ScriptPageSchema = z.object({
  id: z.string(),
  /** Empty means "show the auto-numbered label" (page N by array position) —
   * same convention as Panel.label/panelDisplayLabel() in layoutSchema.ts. */
  label: z.string().default(""),
  notes: z.string().default(""),
  panels: z.array(ScriptPanelSchema).default([]),
  /** Manual, persisted link to a real scanned page (e.g. "page_03") — set once from
   * the page editor's script sidebar. Null means "not linked to any real page yet",
   * the default for every script page created in the standalone script editor.
   * Enforced 1:1 by the sidebar's own UI (it only lets a real page link to a script
   * page that isn't already linked elsewhere), not by this schema. */
  linkedPage: z.string().nullable().default(null),
});
export type ScriptPage = z.infer<typeof ScriptPageSchema>;

export const ScriptDocumentSchema = z.object({
  pages: z.array(ScriptPageSchema).default([]),
});
export type ScriptDocument = z.infer<typeof ScriptDocumentSchema>;

/** The label to display for a script page — its custom label if set, otherwise the
 * caller-supplied fallback (e.g. a translated "Page {{n}}") for its position in the
 * document's pages array. Takes the fallback as a parameter rather than hardcoding
 * English text, since this is shared code called from an already fully localized UI. */
export function scriptPageDisplayLabel(page: ScriptPage, fallback: string): string {
  return page.label.trim() || fallback;
}
