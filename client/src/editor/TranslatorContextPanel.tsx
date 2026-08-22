import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Bubble, PageLayout, Panel } from "../../../shared/src/layoutSchema";
import { panelDisplayLabel } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type PageSummary } from "../api/client";
import { characterName, getPageReadingOrder, groupBubblesByPanel, type BubbleGroup, type ReadingDirection } from "./reportUtils";
import { PanelCropPreview } from "./PanelCropPreview";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — same convention as
   * TextListPanel.tsx's `open` prop (index.css's .text-sidebar/.text-sidebar.open). */
  open: boolean;
  volumeId: string;
  page: string;
  layout: PageLayout;
  characters: Character[];
  languages: LanguageDef[];
  readingDirection: ReadingDirection;
  selectedBubbleId: string | null;
  /** When set (and selectedBubbleId isn't — the editor store keeps bubble/panel
   * selection mutually exclusive), shows every text inside this panel instead of a
   * single bubble's context, with the same previous/next boundary idea generalized to
   * "last text of the panel before" / "first text of the panel after". */
  selectedPanelId: string | null;
  onSelectBubble: (id: string) => void;
  onMove: (direction: "up" | "down") => void;
  onClose: () => void;
}

interface ResolvedNeighbor {
  bubble: Bubble;
  page: string;
  panels: PageLayout["panels"];
  sameLanguagePage: boolean;
}

function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

/** Walks backward from `groupIdx` for the nearest earlier group that actually has
 * bubbles, skipping empty ones (e.g. a silent action panel) — returns its last bubble,
 * or null if every earlier group on the page is empty (a page-crossing boundary). */
function lastBubbleBefore(groups: BubbleGroup[], groupIdx: number): Bubble | null {
  for (let i = groupIdx - 1; i >= 0; i--) {
    if (groups[i].bubbles.length > 0) return groups[i].bubbles[groups[i].bubbles.length - 1];
  }
  return null;
}

/** Symmetric counterpart of lastBubbleBefore() — first bubble of the nearest later
 * non-empty group. */
function firstBubbleAfter(groups: BubbleGroup[], groupIdx: number): Bubble | null {
  for (let i = groupIdx + 1; i < groups.length; i++) {
    if (groups[i].bubbles.length > 0) return groups[i].bubbles[0];
  }
  return null;
}

/** Shows context for whichever is selected — a bubble (previous/current/next bubble in
 * reading order, crossing page boundaries when first/last on its page, plus speaker with
 * Voice Notes) or a panel (every text inside it, plus the last text of the panel before
 * and the first text of the panel after — same boundary-crossing idea, generalized) —
 * along with a cropped preview of the relevant panel. Useful beyond translation itself
 * (lettering, authoring) — anyone editing a page benefits from seeing speaker/reading-
 * order/panel context, so this isn't framed as translator-only. Cross-page neighbor
 * layouts are fetched directly via the API and cached locally (never through
 * store.loadPage, which would reset the current page's selection/undo history). */
export function TranslatorContextPanel({
  open,
  volumeId,
  page,
  layout,
  characters,
  languages,
  readingDirection,
  selectedBubbleId,
  selectedPanelId,
  onSelectBubble,
  onMove,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [panelLanguage, setPanelLanguage] = useState(languages[0]?.code ?? "de");
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [neighborCache, setNeighborCache] = useState<Record<string, PageLayout>>({});

  useEffect(() => {
    setPages(null);
    api.listPages(volumeId).then(setPages);
  }, [volumeId]);

  const mode: "bubble" | "panel" | "none" = selectedBubbleId ? "bubble" : selectedPanelId ? "panel" : "none";
  const groups = groupBubblesByPanel(layout.bubbles, layout.panels, panelLanguage, readingDirection);
  const order = getPageReadingOrder(layout.bubbles, layout.panels, panelLanguage, readingDirection);

  const idx = mode === "bubble" ? order.findIndex((b) => b.id === selectedBubbleId) : -1;
  const current = idx >= 0 ? order[idx] : null;

  // moveBubbleInReadingOrder only reorders within the bubble's own group (its panel, or
  // "Ohne Panel") — so up/down must be enabled based on the bubble's position within
  // THAT group, not its position in the flat whole-page order.
  const currentGroup = current ? groups.find((g) => g.bubbles.some((b) => b.id === current.id)) : undefined;
  const groupIdx = currentGroup ? currentGroup.bubbles.findIndex((b) => b.id === current!.id) : -1;
  const canMoveUp = groupIdx > 0;
  const canMoveDown = groupIdx >= 0 && currentGroup !== undefined && groupIdx < currentGroup.bubbles.length - 1;

  const panelGroupIdx = mode === "panel" ? groups.findIndex((g) => g.panelId === selectedPanelId) : -1;
  const panelItems = panelGroupIdx >= 0 ? groups[panelGroupIdx].bubbles : [];

  const pageIndex = pages?.findIndex((p) => p.page === page) ?? -1;
  const prevPageName = pageIndex > 0 ? pages![pageIndex - 1].page : null;
  const nextPageName = pages && pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1].page : null;

  // The boundary bubble on THIS page, if any — null means "need the neighbor page"
  // (or there simply is no context, at mode "none"). Bubble mode: the flat-order
  // neighbor. Panel mode: the nearest non-empty group before/after this one.
  const sameLastPrev = mode === "bubble" ? (idx > 0 ? order[idx - 1] : null) : mode === "panel" ? lastBubbleBefore(groups, panelGroupIdx) : null;
  const sameFirstNext =
    mode === "bubble" ? (idx < order.length - 1 ? order[idx + 1] : null) : mode === "panel" ? firstBubbleAfter(groups, panelGroupIdx) : null;

  const needsPrevPage = mode !== "none" && !sameLastPrev && !!prevPageName;
  const needsNextPage = mode !== "none" && !sameFirstNext && !!nextPageName;

  useEffect(() => {
    const toFetch = [needsPrevPage ? prevPageName : null, needsNextPage ? nextPageName : null].filter(
      (name): name is string => !!name && !(name in neighborCache)
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((name) => {
      api.getLayout(volumeId, name).then((l) => setNeighborCache((c) => ({ ...c, [name]: l })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPrevPage, needsNextPage, prevPageName, nextPageName, volumeId]);

  function resolveNeighbor(direction: "prev" | "next"): ResolvedNeighbor | null {
    if (mode === "none") return null;
    const sameBubble = direction === "prev" ? sameLastPrev : sameFirstNext;
    if (sameBubble) return { bubble: sameBubble, page, panels: layout.panels, sameLanguagePage: true };
    const neighborPageName = direction === "prev" ? prevPageName : nextPageName;
    if (!neighborPageName) return null;
    const neighborLayout = neighborCache[neighborPageName];
    if (!neighborLayout) return null;
    const neighborOrder = getPageReadingOrder(neighborLayout.bubbles, neighborLayout.panels, panelLanguage, readingDirection);
    const bubble = direction === "prev" ? neighborOrder[neighborOrder.length - 1] : neighborOrder[0];
    if (!bubble) return null;
    return { bubble, page: neighborPageName, panels: neighborLayout.panels, sameLanguagePage: true };
  }

  const prev = resolveNeighbor("prev");
  const next = resolveNeighbor("next");

  function goToNeighbor(n: ResolvedNeighbor) {
    if (n.page === page) onSelectBubble(n.bubble.id);
    else navigate(`/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(n.page)}`);
  }

  const speaker = mode === "bubble" && current ? characters.find((c) => c.id === current.characterId) : undefined;
  const contextPanel: Panel | undefined =
    mode === "bubble"
      ? current?.panelId
        ? layout.panels.find((p) => p.id === current.panelId)
        : undefined
      : mode === "panel"
        ? layout.panels.find((p) => p.id === selectedPanelId)
        : undefined;
  const contextPanelIndex = contextPanel ? layout.panels.findIndex((p) => p.id === contextPanel.id) : -1;

  function renderBubbleRow(n: ResolvedNeighbor, onClick: () => void) {
    return (
      <button className="text-list-row" onClick={onClick}>
        <span className="text-list-type">{characterName(characters, n.bubble.characterId)}</span>
        <span className="text-list-content">{toSingleLine(n.bubble.text[panelLanguage] ?? "") || t("volumeReport.noText")}</span>
      </button>
    );
  }

  return (
    <div className={`text-sidebar${open ? " open" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.translatorContextPanel.title")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>
      <div className="langstrip langstrip-horizontal">
        {languages.map((l) => (
          <button
            key={l.code}
            className={`lang-chip${l.code === panelLanguage ? " active" : ""}`}
            onClick={() => setPanelLanguage(l.code)}
            title={l.label}
          >
            {l.code.toUpperCase()}
          </button>
        ))}
      </div>

      {mode === "none" ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("editor.translatorContextPanel.selectHint")}
        </p>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {mode === "bubble" && (
              <>
                {t("editor.translatorContextPanel.speakerLabel")}{" "}
                <strong style={{ color: "var(--text)" }}>{characterName(characters, current!.characterId)}</strong>
                {" · "}
              </>
            )}
            {t("editor.translatorContextPanel.panelLabel")} {contextPanel ? panelDisplayLabel(contextPanel, contextPanelIndex) : "–"}
          </p>
          {speaker?.voiceNotes.trim() && (
            <p className="hint" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              <strong style={{ color: "var(--text)" }}>{t("managers.characters.voiceNotesLabel")}:</strong> {speaker.voiceNotes}
            </p>
          )}

          <div className="text-list">
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {t("editor.translatorContextPanel.previousLabel")}
            </p>
            {prev ? (
              renderBubbleRow(prev, () => goToNeighbor(prev))
            ) : (
              <p className="hint" style={{ margin: "0 0 0 4px" }}>
                {needsPrevPage ? t("common.loading") : t("editor.translatorContextPanel.pageStart")}
              </p>
            )}

            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {t("editor.translatorContextPanel.currentLabel")}
            </p>
            {mode === "bubble" ? (
              <>
                <div className="text-list-row" style={{ cursor: "default" }}>
                  <span className="text-list-type">{characterName(characters, current!.characterId)}</span>
                  <span className="text-list-content">{toSingleLine(current!.text[panelLanguage] ?? "") || t("volumeReport.noText")}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: 4 }}>
                  <button onClick={() => onMove("up")} disabled={!canMoveUp} title={t("editor.translatorContextPanel.moveUpTitle")}>
                    ↑
                  </button>
                  <button onClick={() => onMove("down")} disabled={!canMoveDown} title={t("editor.translatorContextPanel.moveDownTitle")}>
                    ↓
                  </button>
                </div>
              </>
            ) : panelItems.length === 0 ? (
              <p className="hint" style={{ margin: "0 0 0 4px" }}>
                {t("editor.translatorContextPanel.noTextsInPanel")}
              </p>
            ) : (
              panelItems.map((b) => (
                <button key={b.id} className="text-list-row" onClick={() => onSelectBubble(b.id)}>
                  <span className="text-list-type">{characterName(characters, b.characterId)}</span>
                  <span className="text-list-content">{toSingleLine(b.text[panelLanguage] ?? "") || t("volumeReport.noText")}</span>
                </button>
              ))
            )}

            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {t("editor.translatorContextPanel.nextLabel")}
            </p>
            {next ? (
              renderBubbleRow(next, () => goToNeighbor(next))
            ) : (
              <p className="hint" style={{ margin: "0 0 0 4px" }}>
                {needsNextPage ? t("common.loading") : t("editor.translatorContextPanel.pageEnd")}
              </p>
            )}
          </div>

          {contextPanel ? (
            <PanelCropPreview imageUrl={api.pageImageUrl(volumeId, page)} panel={contextPanel} />
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              {t("editor.translatorContextPanel.noPanelCrop")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
