import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useProject } from "../state/ProjectContext";
import { useProjectRole } from "../state/useProjectRole";
import type { LanguageDef } from "../../../shared/src/languages";
import {
  WORKFLOW_STATUSES,
  WORKFLOW_LANGUAGE_PHASES,
  getWorkflowEntry,
  type WorkflowDocument,
  type WorkflowStatus,
  type WorkflowLanguagePhase,
} from "../../../shared/src/workflow";

/** A volume-wide production board: one row per page, one column for the page-level
 * Cleaning phase plus three columns (Translation/Lettering/QC) per project language —
 * "Page 12: Cleaning done, Lettering DE in progress — Hanjo, QC DE pending" at a
 * glance, instead of inferring status from chat/comments. Mirrors PageGrid.tsx's own
 * inline-<select> editing pattern for page tagging (see updatePageMeta there) rather
 * than a popover, and ExportViewer.tsx's plain-table layout for a volume-wide list
 * view — this is the first per-volume view that genuinely needs both at once. */
export function WorkflowBoard() {
  const { t } = useTranslation();
  const { volumeId = "", projectId = "" } = useParams();
  const navigate = useNavigate();
  const pBase = `/p/${encodeURIComponent(projectId)}`;
  const { project } = useProject();
  const { hasAtLeast } = useProjectRole();
  const canEdit = hasAtLeast("translator");

  const [pages, setPages] = useState<{ page: string; fileName: string }[] | null>(null);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [members, setMembers] = useState<{ userId: string; username: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [pagesData, languagesData, workflowData, membersData] = await Promise.all([
          api.listPages(volumeId),
          api.listLanguages(),
          api.getWorkflow(volumeId),
          api.getWorkflowAssignableMembers(volumeId),
        ]);
        if (cancelled) return;
        setPages(pagesData);
        setLanguages(languagesData);
        setWorkflow(workflowData.workflow);
        setEtag(workflowData.etag);
        setMembers(membersData);
      } catch (err) {
        if (!cancelled) setError(translateApiError(err, t));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId, project]);

  async function updateEntry(
    page: string,
    phase: "cleaning" | WorkflowLanguagePhase,
    languageCode: string | null,
    patch: { status?: WorkflowStatus; assigneeUserId?: string | undefined }
  ) {
    if (!workflow) return;
    const current =
      phase === "cleaning" ? getWorkflowEntry(workflow.pages[page], "cleaning") : getWorkflowEntry(workflow.pages[page], phase, languageCode!);
    const nextEntry = { ...current, ...patch };
    const currentPage = workflow.pages[page] ?? { languages: {} };
    const nextPage =
      phase === "cleaning"
        ? { ...currentPage, cleaning: nextEntry }
        : {
            ...currentPage,
            languages: { ...currentPage.languages, [languageCode!]: { ...currentPage.languages[languageCode!], [phase]: nextEntry } },
          };
    const nextWorkflow: WorkflowDocument = { ...workflow, pages: { ...workflow.pages, [page]: nextPage } };
    setWorkflow(nextWorkflow);
    const result = await api.saveWorkflow(volumeId, nextWorkflow, etag ?? undefined);
    if (result.conflict) {
      setWorkflow(result.current);
      setEtag(null);
      setMessage(t("workflow.conflict"));
    } else {
      setEtag(result.etag);
    }
  }

  if (loading) {
    return (
      <div className="page page-padded">
        <p>{t("workflow.loading")}</p>
      </div>
    );
  }

  if (error) return <div className="error-banner">{error}</div>;

  function statusSelect(page: string, phase: "cleaning" | WorkflowLanguagePhase, languageCode: string | null) {
    const entry =
      phase === "cleaning" ? getWorkflowEntry(workflow!.pages[page], "cleaning") : getWorkflowEntry(workflow!.pages[page], phase, languageCode!);
    return (
      <td key={`${phase}-${languageCode ?? ""}`} className={`workflow-cell workflow-status-${entry.status}`}>
        <select
          value={entry.status}
          disabled={!canEdit}
          onChange={(e) => updateEntry(page, phase, languageCode, { status: e.target.value as WorkflowStatus })}
        >
          {WORKFLOW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`workflow.status.${s}`)}
            </option>
          ))}
        </select>
        <select
          value={entry.assigneeUserId ?? ""}
          disabled={!canEdit}
          onChange={(e) => updateEntry(page, phase, languageCode, { assigneeUserId: e.target.value || undefined })}
        >
          <option value="">{t("workflow.unassigned")}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.username}
            </option>
          ))}
        </select>
      </td>
    );
  }

  return (
    <div className="page">
      <div className="canvas-titlebar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to={`${pBase}/volumes/${encodeURIComponent(volumeId)}`} className="canvas-titlebar-link" style={{ textDecoration: "none" }}>
          <span className="canvas-titlebar-name">{t("workflow.title")}</span>
          <span className="canvas-titlebar-path">/{project ? `${project.name}/${volumeId}` : volumeId}</span>
        </Link>
        <button type="button" onClick={() => navigate(`${pBase}/volumes/${encodeURIComponent(volumeId)}`)}>
          {t("common.close")}
        </button>
      </div>

      {message && (
        <div className="info-banner" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}

      <div style={{ overflowX: "auto", padding: "16px" }}>
        <table className="workflow-table">
          <thead>
            <tr>
              <th>{t("workflow.columnPage")}</th>
              <th>{t("workflow.phase.cleaning")}</th>
              {languages.map((lang) => (
                <React.Fragment key={lang.code}>
                  {WORKFLOW_LANGUAGE_PHASES.map((phase) => (
                    <th key={`${lang.code}-${phase}`}>
                      {lang.label} — {t(`workflow.phase.${phase}`)}
                    </th>
                  ))}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {(pages ?? []).map((p) => (
              <tr key={p.page}>
                <td style={{ fontWeight: 600 }}>{p.page}</td>
                {statusSelect(p.page, "cleaning", null)}
                {languages.map((lang) => (
                  <React.Fragment key={lang.code}>
                    {WORKFLOW_LANGUAGE_PHASES.map((phase) => statusSelect(p.page, phase, lang.code))}
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {(pages ?? []).length === 0 && <p>{t("workflow.noPages")}</p>}
      </div>
    </div>
  );
}
