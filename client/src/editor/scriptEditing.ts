import { v4 as uuid } from "uuid";
import type { ScriptDialogueLine, ScriptPage, ScriptPanel } from "../../../shared/src/script";

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
