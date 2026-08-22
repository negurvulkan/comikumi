import { useTranslation } from "react-i18next";
import type { LanguageDef } from "../../../shared/src/languages";
import type { VolumeSummary } from "../api/client";
import { api } from "../api/client";
import { BookIcon, PageIcon, PanelToolIcon, BubbleToolIcon } from "./Icons";

interface Props {
  name: string;
  description: string;
  coverImagePath: string;
  volumes: VolumeSummary[];
  languages: LanguageDef[];
}

/** Always-visible (not a toggleable slide-in like the editor's sidebars — this is the
 * project-level overview, there's nothing else competing for the slot) project-info +
 * stats panel on the volume overview. Stats are summed client-side from the per-volume
 * numbers /api/volumes already returns (see server/src/routes/volumes.ts) rather than
 * a separate aggregate endpoint — one source of truth, and volumes.length is already
 * available locally anyway. */
export function ProjectInfoSidebar({ name, description, coverImagePath, volumes, languages }: Props) {
  const { t } = useTranslation();

  const pageCount = volumes.reduce((sum, v) => sum + v.pageCount, 0);
  const panelCount = volumes.reduce((sum, v) => sum + v.panelCount, 0);
  const bubbleCount = volumes.reduce((sum, v) => sum + v.bubbleCount, 0);
  const bubbleCountByLanguage: Record<string, number> = {};
  for (const v of volumes) {
    for (const [code, count] of Object.entries(v.bubbleCountByLanguage)) {
      bubbleCountByLanguage[code] = (bubbleCountByLanguage[code] ?? 0) + count;
    }
  }

  return (
    <div className="project-info-sidebar">
      {coverImagePath && <img src={api.projectCoverUrl(coverImagePath)} alt="" className="project-info-cover" />}
      <p className="project-info-name">{name}</p>
      {description.trim() && <p className="project-info-description">{description}</p>}

      <div className="project-stats-list">
        <div className="project-stat-row" title={t("volumeList.statVolumesTooltip")}>
          <BookIcon />
          <span className="project-stat-value">{volumes.length}</span>
          <span>{t("volumeList.statVolumes")}</span>
        </div>
        <div className="project-stat-row" title={t("volumeList.statPagesTooltip")}>
          <PageIcon />
          <span className="project-stat-value">{pageCount}</span>
          <span>{t("volumeList.statPages")}</span>
        </div>
        <div className="project-stat-row" title={t("volumeList.statPanelsTooltip")}>
          <PanelToolIcon />
          <span className="project-stat-value">{panelCount}</span>
          <span>{t("volumeList.statPanels")}</span>
        </div>
        <div className="project-stat-row" title={t("volumeList.statBubblesTooltip")}>
          <BubbleToolIcon />
          <span className="project-stat-value">{bubbleCount}</span>
          <span>{t("volumeList.statBubbles")}</span>
        </div>
        {languages.length > 0 && (
          <div className="project-stat-lang-list">
            {languages.map((l) => (
              <div
                key={l.code}
                className="project-stat-lang-row"
                title={t("volumeList.statBubblesByLanguageTooltip", { language: l.label })}
              >
                <span className="project-stat-lang-code">{l.code.toUpperCase()}</span>
                <span className="project-stat-value">{bubbleCountByLanguage[l.code] ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
