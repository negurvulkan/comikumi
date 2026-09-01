import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Bubble } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { resolveChapters } from "../../../shared/src/pageMeta";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { runQaChecks, type QaCategory, type QaIssue } from "./qaChecks";

interface Props {
  volumeId: string;
  languages: LanguageDef[];
  glossary: GlossaryEntry[];
  presets: LetteringPreset[];
  /** Jumps to a specific bubble on a specific page — Editor.tsx passes a navigate +
   * select callback; PageGrid.tsx (no open editor yet) can pass undefined and the
   * "jump" affordance is simply omitted per-row (see the row's own conditional). */
  onJumpToBubble?: (page: string, bubbleId: string) => void;
  onClose: () => void;
}

const CATEGORY_ORDER: QaCategory[] = ["missingTranslation", "untranslatedGlossaryTerm", "duplicatePreset"];

/** Volume-wide QA scan — reuses api.getVolumeReport() (same one VolumeReportModal.tsx
 * fetches) so this needs no new server endpoint, then runs the pure runQaChecks()
 * (qaChecks.ts) client-side and lists every finding grouped by category. */
export function QaCheckModal({ volumeId, languages, glossary, presets, onJumpToBubble, onClose }: Props) {
  const { t } = useTranslation();
  const [pages, setPages] = useState<{ page: string; bubbles: Bubble[] }[] | null>(null);
  const [chapterOfPage, setChapterOfPage] = useState<Map<string, string>>(new Map());
  const [resolvedChapters, setResolvedChapters] = useState<ReturnType<typeof resolveChapters>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getVolumeReport(volumeId), api.getPageMeta(volumeId)])
      .then(([rows, pageMeta]) => {
        setPages(rows.map((r) => ({ page: r.page, bubbles: r.layout.bubbles })));
        setChapterOfPage(new Map(Object.entries(pageMeta.meta.pages).flatMap(([p, e]) => (e.chapterId ? [[p, e.chapterId] as const] : []))));
        // `rows` is already in saved volume page order — safe to use directly as
        // resolveChapters()'s pageOrder input, same reasoning as VolumeReportModal.tsx.
        setResolvedChapters(resolveChapters(rows.map((r) => r.page), pageMeta.meta));
      })
      .catch((e) => setError(translateApiError(e, t)));
  }, [volumeId, t]);

  const issues: QaIssue[] = pages ? runQaChecks(pages, languages, glossary, presets) : [];
  const byCategory = new Map<QaCategory, QaIssue[]>();
  for (const issue of issues) {
    if (!byCategory.has(issue.category)) byCategory.set(issue.category, []);
    byCategory.get(issue.category)!.push(issue);
  }

  /** Sub-groups one category's issues by chapter — only when the volume actually has
   * chapters configured (matches PageGrid.tsx's "no clutter on an untagged volume"
   * decision, see the plan): a single bucket with an empty label renders as a flat
   * list, unchanged from before this feature. Order: chapters in volume order, then
   * "no chapter" (a page exists but isn't tagged), then "no page context" (issues like
   * duplicatePreset that aren't tied to any single page at all). */
  function chapterSubGroups(group: QaIssue[]): { label: string; issues: QaIssue[] }[] {
    if (resolvedChapters.length === 0) return [{ label: "", issues: group }];
    const noPageContext: QaIssue[] = [];
    const noChapter: QaIssue[] = [];
    const byChapterId = new Map<string, QaIssue[]>();
    for (const issue of group) {
      if (issue.page === undefined) {
        noPageContext.push(issue);
        continue;
      }
      const chapterId = chapterOfPage.get(issue.page);
      if (!chapterId) {
        noChapter.push(issue);
        continue;
      }
      if (!byChapterId.has(chapterId)) byChapterId.set(chapterId, []);
      byChapterId.get(chapterId)!.push(issue);
    }
    const result: { label: string; issues: QaIssue[] }[] = [];
    for (const { chapter } of resolvedChapters) {
      const chapterIssues = byChapterId.get(chapter.id);
      if (chapterIssues && chapterIssues.length > 0) result.push({ label: chapter.name, issues: chapterIssues });
    }
    if (noChapter.length > 0) result.push({ label: t("pageGrid.noChapterSection"), issues: noChapter });
    if (noPageContext.length > 0) result.push({ label: t("qaChecker.noPageContext"), issues: noPageContext });
    return result;
  }

  return (
    <div className="inspector" style={{ width: 520, maxWidth: "85vw", maxHeight: "80vh" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("qaChecker.title")}</p>
      {error && <div className="error-banner">{error}</div>}
      {!pages ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("common.loading")}
        </p>
      ) : issues.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t("qaChecker.noIssues")}
        </p>
      ) : (
        <div className="text-list" style={{ flex: "0 0 auto", maxHeight: 420 }}>
          {CATEGORY_ORDER.map((category) => {
            const group = byCategory.get(category);
            if (!group || group.length === 0) return null;
            return (
              <div key={category} style={{ marginBottom: 8 }}>
                <p className="report-heading" style={{ margin: "0 0 4px" }}>
                  {t(`qaChecker.category.${category}`, { count: group.length })}
                </p>
                {chapterSubGroups(group).map((sub, subIndex) => (
                  <div key={sub.label || subIndex} style={{ marginBottom: 4 }}>
                    {sub.label && (
                      <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{sub.label}</p>
                    )}
                    {sub.issues.map((issue) => (
                      <div key={issue.id} className="text-list-row" style={{ cursor: issue.bubbleId && onJumpToBubble ? "pointer" : "default" }}>
                        <span className="text-list-content">{t(`qaChecker.issue.${issue.category}`, issue.params)}</span>
                        {issue.page && issue.bubbleId && onJumpToBubble && (
                          <button type="button" onClick={() => onJumpToBubble(issue.page!, issue.bubbleId!)}>
                            {t("qaChecker.jumpButton")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <button onClick={onClose}>{t("common.close")}</button>
    </div>
  );
}
