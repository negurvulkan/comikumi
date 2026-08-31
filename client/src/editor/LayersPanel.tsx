import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Bubble, CurvedTextElement, ImageElement, LayerItem, Panel } from "../../../shared/src/layoutSchema";
import { imageFileForLanguage } from "../../../shared/src/layoutSchema";
import { groupBubblesByPanel, type ReadingDirection } from "./reportUtils";
import { useResizableSidebarWidth } from "./useResizableSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { BringToFrontIcon, SendToBackIcon } from "./Icons";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — same convention as
   * TextListPanel.tsx's `open` prop. */
  open: boolean;
  bubbles: Bubble[];
  images: ImageElement[];
  curvedTexts: CurvedTextElement[];
  panels: Panel[];
  activeLanguage: string;
  readingDirection: ReadingDirection;
  selectedBubbleIds: string[];
  selectedImageIds: string[];
  selectedCurvedTextIds: string[];
  selectedPanelIds: string[];
  onSelectBubble: (id: string, additive?: boolean) => void;
  onSelectImage: (id: string, additive?: boolean) => void;
  onSelectCurvedText: (id: string, additive?: boolean) => void;
  onSelectPanel: (id: string, additive?: boolean) => void;
  onChangeBubble: (id: string, patch: Partial<Bubble>) => void;
  onChangeImage: (id: string, patch: Partial<ImageElement>) => void;
  onChangeCurvedText: (id: string, patch: Partial<CurvedTextElement>) => void;
  onSetAllPanelsLocked: (locked: boolean) => void;
  onSetPanelLockCascade: (panelId: string, locked: boolean) => void;
  /** Moves a bubble/image/curved text to the very top/bottom of the page's paint order
   * (see layoutSchema.ts's pageLayerOrder/withLayerOrder) — panels are excluded, they're
   * an always-bottom, editor-only reference layer, so no button for these on panel
   * group headers. */
  onBringToFront: (target: LayerItem) => void;
  onSendToBack: (target: LayerItem) => void;
  onClose: () => void;
}

function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

type Row = { kind: "bubble"; bubble: Bubble } | { kind: "image"; image: ImageElement } | { kind: "curvedText"; el: CurvedTextElement };

function rowId(row: Row): string {
  return row.kind === "bubble" ? row.bubble.id : row.kind === "image" ? row.image.id : row.el.id;
}

function rowLocked(row: Row): boolean {
  return row.kind === "bubble" ? !!row.bubble.locked : row.kind === "image" ? !!row.image.locked : !!row.el.locked;
}

/** Row.kind's three values are exactly LayerItem["type"]'s union — reused directly for
 * the bring-to-front/send-to-back actions instead of a second parallel enum. */
function rowLayerItem(row: Row): LayerItem {
  return { type: row.kind, id: rowId(row) };
}

/**
 * Structural navigator — every element on the page grouped by panel (reusing
 * reportUtils.ts's groupBubblesByPanel, the same grouping the reports/script
 * generation already use), each with its own lock toggle, plus bulk "lock/unlock all
 * panels". Answers "panels make it hard to click a specific bubble/overlay underneath,
 * and locking each one by hand is tedious" — see TODO.md's Batch-E-adjacent notes.
 *
 * Deliberately separate from TextListPanel.tsx: that one stays focused on the
 * translation reading list (independent language tab, bubbles+curved texts only,
 * sorted by position); this one is about structure/protection (grouped by panel,
 * covers images too, has lock affordances). Same sidebar shell (.text-sidebar,
 * resizable) and .text-list/-row/-type/-content CSS as TextListPanel.tsx/
 * ReportModal.tsx for visual consistency.
 *
 * Images/curved texts have no `panelId` (shared/src/layoutSchema.ts) — they always
 * land in the "no panel" bucket alongside groupBubblesByPanel's own unassigned
 * bubbles, and are therefore never part of a panel's lock CASCADE (locking a panel via
 * onSetPanelLockCascade only ever touches the panel itself and its assigned bubbles).
 */
export function LayersPanel({
  open,
  bubbles,
  images,
  curvedTexts,
  panels,
  activeLanguage,
  readingDirection,
  selectedBubbleIds,
  selectedImageIds,
  selectedCurvedTextIds,
  selectedPanelIds,
  onSelectBubble,
  onSelectImage,
  onSelectCurvedText,
  onSelectPanel,
  onChangeBubble,
  onChangeImage,
  onChangeCurvedText,
  onSetAllPanelsLocked,
  onSetPanelLockCascade,
  onBringToFront,
  onSendToBack,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const resize = useResizableSidebarWidth();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const groups = groupBubblesByPanel(bubbles, panels, activeLanguage, readingDirection).map((g) => ({
    panelId: g.panelId,
    label: g.panelId === null ? t("editor.layersPanel.noPanel") : g.label,
    rows: [
      ...g.bubbles.map((bubble): Row => ({ kind: "bubble", bubble })),
      ...(g.panelId === null ? images.map((image): Row => ({ kind: "image", image })) : []),
      ...(g.panelId === null ? curvedTexts.map((el): Row => ({ kind: "curvedText", el })) : []),
    ],
  }));

  const totalElements = bubbles.length + images.length + curvedTexts.length + panels.length;

  function toggleCollapsed(key: string) {
    setCollapsedGroups((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function rowLabel(row: Row): string {
    if (row.kind === "bubble") return toSingleLine(row.bubble.text[activeLanguage] ?? "") || t("volumeReport.noText");
    if (row.kind === "image") return imageFileForLanguage(row.image, activeLanguage) ?? t("editor.layersPanel.noImageFile");
    return toSingleLine(row.el.text[activeLanguage] ?? "") || t("volumeReport.noText");
  }

  function rowSelected(row: Row): boolean {
    if (row.kind === "bubble") return selectedBubbleIds.includes(row.bubble.id);
    if (row.kind === "image") return selectedImageIds.includes(row.image.id);
    return selectedCurvedTextIds.includes(row.el.id);
  }

  function handleRowClick(row: Row, additive: boolean) {
    if (row.kind === "bubble") onSelectBubble(row.bubble.id, additive);
    else if (row.kind === "image") onSelectImage(row.image.id, additive);
    else onSelectCurvedText(row.el.id, additive);
  }

  function toggleRowLock(row: Row) {
    const patch = { locked: rowLocked(row) ? undefined : true };
    if (row.kind === "bubble") onChangeBubble(row.bubble.id, patch);
    else if (row.kind === "image") onChangeImage(row.image.id, patch);
    else onChangeCurvedText(row.el.id, patch);
  }

  return (
    <div className={`text-sidebar${open ? " open" : ""}`} style={{ width: open ? resize.width : undefined }}>
      <SidebarResizeHandle
        dragging={resize.dragging}
        onPointerDown={resize.handlePointerDown}
        onPointerMove={resize.handlePointerMove}
        onPointerUp={resize.handlePointerUp}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.layersPanel.title")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>
      <div className="field-row">
        <button type="button" onClick={() => onSetAllPanelsLocked(true)} disabled={panels.length === 0}>
          {t("editor.layersPanel.lockAllPanels")}
        </button>
        <button type="button" onClick={() => onSetAllPanelsLocked(false)} disabled={panels.length === 0}>
          {t("editor.layersPanel.unlockAllPanels")}
        </button>
      </div>

      {totalElements === 0 ? (
        <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("editor.layersPanel.empty")}</p>
      ) : (
        <div className="text-list">
          {groups.map((group) => {
            const panel = group.panelId ? panels.find((p) => p.id === group.panelId) : undefined;
            const groupKey = group.panelId ?? "__unassigned__";
            const isCollapsed = collapsedGroups.has(groupKey);
            return (
              <div key={groupKey} style={{ marginBottom: 4 }}>
                <div className={`text-list-row${panel && selectedPanelIds.includes(panel.id) ? " active" : ""}`} style={{ cursor: "default" }}>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(groupKey)}
                    title={isCollapsed ? t("editor.layersPanel.expand") : t("editor.layersPanel.collapse")}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                  <span
                    className="text-list-content"
                    style={{ fontWeight: 600, cursor: panel ? "pointer" : "default" }}
                    onClick={(e) => panel && onSelectPanel(panel.id, e.shiftKey)}
                  >
                    {group.label}
                  </span>
                  {panel && (
                    <button
                      type="button"
                      onClick={() => onSetPanelLockCascade(panel.id, !panel.locked)}
                      title={panel.locked ? t("editor.layersPanel.unlockPanelHint") : t("editor.layersPanel.lockPanelHint")}
                    >
                      {panel.locked ? "🔒" : "🔓"}
                    </button>
                  )}
                </div>
                {!isCollapsed &&
                  group.rows.map((row) => {
                    const locked = rowLocked(row);
                    return (
                      <div
                        key={`${row.kind}-${rowId(row)}`}
                        className={`text-list-row${rowSelected(row) ? " active" : ""}`}
                        style={{ paddingLeft: 24 }}
                        onClick={(e) => handleRowClick(row, e.shiftKey)}
                      >
                        <span className="text-list-type">
                          {t(
                            `editor.layersPanel.type${
                              row.kind === "bubble" ? (row.bubble.isEffect ? "Effect" : "Bubble") : row.kind === "image" ? "Image" : "CurvedText"
                            }`
                          )}
                        </span>
                        <span className="text-list-content">{rowLabel(row)}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBringToFront(rowLayerItem(row));
                          }}
                          title={t("editor.layersPanel.bringToFrontHint")}
                        >
                          <BringToFrontIcon />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSendToBack(rowLayerItem(row));
                          }}
                          title={t("editor.layersPanel.sendToBackHint")}
                        >
                          <SendToBackIcon />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowLock(row);
                          }}
                          title={locked ? t("editor.layersPanel.unlockHint") : t("editor.layersPanel.lockHint")}
                        >
                          {locked ? "🔒" : "🔓"}
                        </button>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
