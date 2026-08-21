import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Bubble, PageLayout } from "../../../shared/src/layoutSchema";
import { panelDisplayLabel } from "../../../shared/src/layoutSchema";
import type { Character } from "../../../shared/src/characters";
import type { LanguageDef } from "../../../shared/src/languages";
import { api, type PageSummary } from "../api/client";
import { characterName, getPageReadingOrder, groupBubblesByPanel } from "./reportUtils";
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
  selectedBubbleId: string | null;
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

/** Shows the previous/current/next bubble in reading order for the translator — crossing
 * page boundaries when the current bubble is first/last on its page — plus the current
 * bubble's speaker (with Voice Notes) and a cropped preview of its panel. Cross-page
 * neighbor layouts are fetched directly via the API and cached locally (never through
 * store.loadPage, which would reset the current page's selection/undo history). */
export function TranslatorContextPanel({
  open,
  volumeId,
  page,
  layout,
  characters,
  languages,
  selectedBubbleId,
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

  const order = getPageReadingOrder(layout.bubbles, layout.panels, panelLanguage);
  const idx = selectedBubbleId ? order.findIndex((b) => b.id === selectedBubbleId) : -1;
  const current = idx >= 0 ? order[idx] : null;

  // moveBubbleInReadingOrder only reorders within the bubble's own group (its panel, or
  // "Ohne Panel") — so up/down must be enabled based on the bubble's position within
  // THAT group, not its position in the flat whole-page order used for prev/next.
  const currentGroup = current
    ? groupBubblesByPanel(layout.bubbles, layout.panels, panelLanguage).find((g) => g.bubbles.some((b) => b.id === current.id))
    : undefined;
  const groupIdx = currentGroup ? currentGroup.bubbles.findIndex((b) => b.id === current!.id) : -1;
  const canMoveUp = groupIdx > 0;
  const canMoveDown = groupIdx >= 0 && currentGroup !== undefined && groupIdx < currentGroup.bubbles.length - 1;

  const pageIndex = pages?.findIndex((p) => p.page === page) ?? -1;
  const prevPageName = pageIndex > 0 ? pages![pageIndex - 1].page : null;
  const nextPageName = pages && pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1].page : null;

  const needsPrevPage = idx === 0 && !!prevPageName;
  const needsNextPage = idx >= 0 && idx === order.length - 1 && !!nextPageName;

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
    if (idx < 0) return null;
    if (direction === "prev" && idx > 0) return { bubble: order[idx - 1], page, panels: layout.panels, sameLanguagePage: true };
    if (direction === "next" && idx < order.length - 1)
      return { bubble: order[idx + 1], page, panels: layout.panels, sameLanguagePage: true };
    const neighborPageName = direction === "prev" ? prevPageName : nextPageName;
    if (!neighborPageName) return null;
    const neighborLayout = neighborCache[neighborPageName];
    if (!neighborLayout) return null;
    const neighborOrder = getPageReadingOrder(neighborLayout.bubbles, neighborLayout.panels, panelLanguage);
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

  const speaker = current ? characters.find((c) => c.id === current.characterId) : undefined;
  const currentPanel = current?.panelId ? layout.panels.find((p) => p.id === current.panelId) : undefined;
  const currentPanelIndex = currentPanel ? layout.panels.findIndex((p) => p.id === currentPanel.id) : -1;

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

      {!current ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("editor.translatorContextPanel.selectBubbleHint")}
        </p>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>
            {t("editor.translatorContextPanel.speakerLabel")}{" "}
            <strong style={{ color: "var(--text)" }}>{characterName(characters, current.characterId)}</strong>
            {" · "}
            {t("editor.translatorContextPanel.panelLabel")} {currentPanel ? panelDisplayLabel(currentPanel, currentPanelIndex) : "–"}
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
              <button className="text-list-row" onClick={() => goToNeighbor(prev)}>
                <span className="text-list-type">{characterName(characters, prev.bubble.characterId)}</span>
                <span className="text-list-content">{toSingleLine(prev.bubble.text[panelLanguage] ?? "") || t("volumeReport.noText")}</span>
              </button>
            ) : (
              <p className="hint" style={{ margin: "0 0 0 4px" }}>
                {needsPrevPage ? t("common.loading") : t("editor.translatorContextPanel.pageStart")}
              </p>
            )}

            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {t("editor.translatorContextPanel.currentLabel")}
            </p>
            <div className="text-list-row" style={{ cursor: "default" }}>
              <span className="text-list-type">{characterName(characters, current.characterId)}</span>
              <span className="text-list-content">{toSingleLine(current.text[panelLanguage] ?? "") || t("volumeReport.noText")}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginLeft: 4 }}>
              <button onClick={() => onMove("up")} disabled={!canMoveUp} title={t("editor.translatorContextPanel.moveUpTitle")}>
                ↑
              </button>
              <button onClick={() => onMove("down")} disabled={!canMoveDown} title={t("editor.translatorContextPanel.moveDownTitle")}>
                ↓
              </button>
            </div>

            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>
              {t("editor.translatorContextPanel.nextLabel")}
            </p>
            {next ? (
              <button className="text-list-row" onClick={() => goToNeighbor(next)}>
                <span className="text-list-type">{characterName(characters, next.bubble.characterId)}</span>
                <span className="text-list-content">{toSingleLine(next.bubble.text[panelLanguage] ?? "") || t("volumeReport.noText")}</span>
              </button>
            ) : (
              <p className="hint" style={{ margin: "0 0 0 4px" }}>
                {needsNextPage ? t("common.loading") : t("editor.translatorContextPanel.pageEnd")}
              </p>
            )}
          </div>

          {currentPanel ? (
            <PanelCropPreview imageUrl={api.pageImageUrl(volumeId, page)} panel={currentPanel} />
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
