import { v4 as uuid } from "uuid";
import type { ScriptDialogueLine, ScriptPage, ScriptPanel } from "../../../shared/src/script";
import type { PageLayout } from "../../../shared/src/layoutSchema";
import { groupBubblesByPanel, type ReadingDirection } from "./reportUtils";

/** Pure, immutable update helpers for a single script page/panel — shared by the
 * standalone script editor (routes/ScriptEditor.tsx, operating across a whole
 * document's pages) and the in-page-editor script sidebar (ScriptSidebar.tsx,
 * operating on just the one page linked to the currently open real page), so the
 * nested page->panel->dialogue update logic exists in exactly one place. */

export function emptyPanel(): ScriptPanel {
  return { id: uuid(), sizeHint: "medium", composition: "", action: "", dialogue: [] };
}

export function emptyPage(): ScriptPage {
  return { id: uuid(), label: "", notes: "", panels: [], linkedPage: null };
}

export function addPanel(page: ScriptPage): ScriptPage {
  return { ...page, panels: [...page.panels, emptyPanel()] };
}

export function updatePanel(page: ScriptPage, panelId: string, patch: Partial<ScriptPanel>): ScriptPage {
  return { ...page, panels: page.panels.map((p) => (p.id === panelId ? { ...p, ...patch } : p)) };
}

export function deletePanel(page: ScriptPage, panelId: string): ScriptPage {
  return { ...page, panels: page.panels.filter((p) => p.id !== panelId) };
}

export function movePanel(page: ScriptPage, panelId: string, direction: "up" | "down"): ScriptPage {
  const idx = page.panels.findIndex((p) => p.id === panelId);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= page.panels.length) return page;
  const panels = [...page.panels];
  [panels[idx], panels[swapWith]] = [panels[swapWith], panels[idx]];
  return { ...page, panels };
}

export function addDialogueLine(panel: ScriptPanel): ScriptPanel {
  return { ...panel, dialogue: [...panel.dialogue, { id: uuid(), characterId: null, text: {}, note: "" } satisfies ScriptDialogueLine] };
}

export function updateDialogueLine(panel: ScriptPanel, lineId: string, patch: Partial<ScriptDialogueLine>): ScriptPanel {
  return { ...panel, dialogue: panel.dialogue.map((d) => (d.id === lineId ? { ...d, ...patch } : d)) };
}

export function deleteDialogueLine(panel: ScriptPanel, lineId: string): ScriptPanel {
  return { ...panel, dialogue: panel.dialogue.filter((d) => d.id !== lineId) };
}

/** Bootstraps a ScriptPage from an already-lettered page's saved layout — one
 * ScriptPanel per real Panel (in reading order) plus a trailing one for bubbles
 * with no panel assigned, each carrying one dialogue line per bubble with its
 * character and per-language text copied over directly (both are already
 * Record<languageCode, string>, no conversion needed). Composition/action/size
 * hint can't be inferred from bubble data, so they're left blank for the user to
 * fill in by hand. Groups via groupBubblesByPanel with an empty language code so
 * ordering always uses each bubble's base geometry (resolveBubbleForm finds no
 * formOverride for language ""), independent of any particular project language. */
export function scriptPageFromLayout(page: string, layout: PageLayout, readingDirection: ReadingDirection = "rtl"): ScriptPage {
  const groups = groupBubblesByPanel(layout.bubbles, layout.panels, "", readingDirection);
  return {
    id: uuid(),
    label: "",
    notes: "",
    linkedPage: page,
    panels: groups.map((group) => ({
      id: uuid(),
      sizeHint: "medium",
      composition: "",
      action: "",
      dialogue: group.bubbles.map((b) => ({ id: uuid(), characterId: b.characterId, text: { ...b.text }, note: "" })),
    })),
  };
}
