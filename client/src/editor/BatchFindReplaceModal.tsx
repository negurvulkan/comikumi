import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VolumeSummary } from "../api/client";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { buildProjectSearchIndex, type IndexedBubble } from "./projectSearchIndex";
import { applyReplacementToText, findMatches, type FindReplaceMatch } from "./findReplace";

interface Props {
  volumes: VolumeSummary[];
  onClose: () => void;
}

function toSingleLine(text: string): string {
  return text.trim().replace(/\s*\n+\s*/g, " ⏎ ");
}

type ApplyOutcome = { matchId: string; status: "saved" | "conflict" | "error"; message?: string };

/** Project-wide (all volumes) search & replace across every bubble's text, with an
 * explicit preview-then-apply step — the search index is built once (buildProjectSearchIndex,
 * projectSearchIndex.ts) when the user first searches, then re-filtered locally on every
 * keystroke instead of re-fetching per keystroke. Applying re-fetches each affected
 * page's current layout+ETag right before saving (api.getLayoutWithEtag/saveLayout) and
 * re-runs the replacement against that fresh text (findReplace.ts's applyReplacementToText)
 * rather than writing back the stale preview — the same optimistic-concurrency protection
 * the single-page editor already relies on, extended to a multi-page bulk write. */
export function BatchFindReplaceModal({ volumes, onClose }: Props) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [index, setIndex] = useState<IndexedBubble[] | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<ApplyOutcome[] | null>(null);

  const matches: FindReplaceMatch[] = useMemo(
    () => (index ? findMatches(index, searchTerm, replaceTerm, caseSensitive) : []),
    [index, searchTerm, replaceTerm, caseSensitive]
  );
  const selectedMatches = matches.filter((m) => !excludedIds.has(m.id));

  async function handleSearch() {
    if (index) return; // already built — matches recompute live from state above
    setLoadingIndex(true);
    setIndexError(null);
    try {
      setIndex(await buildProjectSearchIndex(volumes));
    } catch (e) {
      setIndexError(translateApiError(e, t));
    } finally {
      setLoadingIndex(false);
    }
  }

  async function handleApply() {
    if (selectedMatches.length === 0) return;
    setApplying(true);
    setOutcomes(null);
    // One page can carry several matched bubbles/languages — group so each page is
    // fetched and saved exactly once, not once per match.
    const byPage = new Map<string, FindReplaceMatch[]>();
    for (const m of selectedMatches) {
      const key = `${m.volumeId}::${m.page}`;
      if (!byPage.has(key)) byPage.set(key, []);
      byPage.get(key)!.push(m);
    }

    const results: ApplyOutcome[] = [];
    for (const pageMatches of byPage.values()) {
      const { volumeId, page } = pageMatches[0];
      try {
        const { layout, etag } = await api.getLayoutWithEtag(volumeId, page);
        const nextBubbles = layout.bubbles.map((bubble) => {
          const bubbleMatches = pageMatches.filter((m) => m.bubbleId === bubble.id);
          if (bubbleMatches.length === 0) return bubble;
          const nextText = { ...bubble.text };
          for (const m of bubbleMatches) {
            if (nextText[m.language] !== undefined) {
              nextText[m.language] = applyReplacementToText(nextText[m.language], searchTerm, replaceTerm, caseSensitive);
            }
          }
          return { ...bubble, text: nextText };
        });
        const saveResult = await api.saveLayout(volumeId, page, { ...layout, bubbles: nextBubbles }, etag ?? undefined);
        for (const m of pageMatches) {
          results.push(
            saveResult.conflict
              ? { matchId: m.id, status: "conflict", message: t("batchFindReplace.conflictHint") }
              : { matchId: m.id, status: "saved" }
          );
        }
      } catch (e) {
        for (const m of pageMatches) results.push({ matchId: m.id, status: "error", message: translateApiError(e, t) });
      }
    }
    setOutcomes(results);
    setApplying(false);
    // Force a fresh index on the next search, so re-running after applying reflects
    // what was actually saved instead of the now-stale in-memory copy.
    setIndex(null);
  }

  return (
    <div className="inspector" style={{ width: 560, maxWidth: "90vw", maxHeight: "85vh" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("batchFindReplace.title")}</p>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        {t("batchFindReplace.scopeHint")}
      </p>

      <div className="field-row">
        <label>
          {t("batchFindReplace.searchLabel")}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setOutcomes(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </label>
        <label>
          {t("batchFindReplace.replaceLabel")}
          <input type="text" value={replaceTerm} onChange={(e) => setReplaceTerm(e.target.value)} />
        </label>
      </div>
      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
        {t("batchFindReplace.caseSensitiveLabel")}
      </label>
      <button type="button" onClick={handleSearch} disabled={!searchTerm.trim() || loadingIndex}>
        {loadingIndex ? t("common.loading") : t("batchFindReplace.searchButton")}
      </button>
      {indexError && <div className="error-banner">{indexError}</div>}

      {index && (
        <>
          <div className="field-label-row">
            <p className="report-heading" style={{ margin: "8px 0 0" }}>
              {t("batchFindReplace.matchesHeading", { count: matches.length })}
            </p>
            {matches.length > 0 && (
              <button
                type="button"
                onClick={() => setExcludedIds(excludedIds.size === 0 ? new Set(matches.map((m) => m.id)) : new Set())}
              >
                {excludedIds.size === 0 ? t("batchFindReplace.deselectAll") : t("batchFindReplace.selectAll")}
              </button>
            )}
          </div>
          {matches.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>
              {t("batchFindReplace.noMatches")}
            </p>
          ) : (
            <div className="text-list" style={{ flex: "0 0 auto", maxHeight: 280 }}>
              {matches.map((m) => {
                const outcome = outcomes?.find((o) => o.matchId === m.id);
                return (
                  <div key={m.id} className="text-list-row" style={{ cursor: "default" }}>
                    <input
                      type="checkbox"
                      checked={!excludedIds.has(m.id)}
                      disabled={applying}
                      onChange={(e) => {
                        const next = new Set(excludedIds);
                        if (e.target.checked) next.delete(m.id);
                        else next.add(m.id);
                        setExcludedIds(next);
                      }}
                    />
                    <span className="text-list-type">
                      {m.volumeLabel} / {m.page} ({m.language})
                    </span>
                    <span className="text-list-content">
                      {toSingleLine(m.before)} → {toSingleLine(m.after)}
                      {outcome && (
                        <>
                          {" "}
                          — {t(`batchFindReplace.outcome.${outcome.status}`)}
                          {outcome.message ? `: ${outcome.message}` : ""}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {matches.length > 0 && (
            <button type="button" className="primary" onClick={handleApply} disabled={applying || selectedMatches.length === 0}>
              {applying
                ? t("common.saving")
                : t("batchFindReplace.applyButton", { count: selectedMatches.length })}
            </button>
          )}
        </>
      )}

      <button onClick={onClose}>{t("common.close")}</button>
    </div>
  );
}
