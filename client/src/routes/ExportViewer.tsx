import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useConfirmDialog } from "../editor/ConfirmDialog";
import { useProject } from "../state/ProjectContext";
import { useProjectRole } from "../state/useProjectRole";
import type { LanguageDef } from "../../../shared/src/languages";

interface ExportFile {
  name: string;
  page: string;
  extension: string;
  size: number;
  mtime: string;
  url: string;
}

interface LanguageExportSummary {
  folderSuffix: string;
  folderName: string;
  files: ExportFile[];
}

export function ExportViewer() {
  const { t } = useTranslation();
  const { volumeId = "" } = useParams();
  const navigate = useNavigate();
  const { project } = useProject();
  const { hasAtLeast } = useProjectRole();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [pages, setPages] = useState<{ page: string; fileName: string }[] | null>(null);
  const [exportsSummary, setExportsSummary] = useState<LanguageExportSummary[] | null>(null);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inspectingFile, setInspectingFile] = useState<ExportFile | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pagesData, exportsData, languagesData] = await Promise.all([
        api.listPages(volumeId),
        api.listExports(volumeId),
        api.listLanguages()
      ]);
      setPages(pagesData);
      setExportsSummary(exportsData.exports);
      setLanguages(languagesData);

      // Auto-select first language suffix from exports, or fallback to first project language
      if (exportsData.exports.length > 0 && !selectedLanguage) {
        setSelectedLanguage(exportsData.exports[0].folderSuffix);
      } else if (languagesData.length > 0 && !selectedLanguage) {
        setSelectedLanguage(languagesData[0].folderSuffix);
      }
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId, project]);

  const currentSummary = exportsSummary?.find((e) => e.folderSuffix === selectedLanguage);
  const filesMap = new Map<string, ExportFile[]>();
  if (currentSummary) {
    for (const f of currentSummary.files) {
      const list = filesMap.get(f.page) || [];
      list.push(f);
      filesMap.set(f.page, list);
    }
  }

  const handleDeleteFolder = async () => {
    if (!selectedLanguage) return;
    const ok = await confirm({
      title: t("exportViewer.deleteFolder"),
      message: t("exportViewer.deleteFolderConfirm", { language: selectedLanguage }),
      danger: true
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.deleteExportFolder(volumeId, selectedLanguage);
      await loadData();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFile = async (file: ExportFile) => {
    const ok = await confirm({
      title: t("exportViewer.delete"),
      message: t("exportViewer.deleteFileConfirm", { file: file.name }),
      danger: true
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.deleteExportFile(volumeId, selectedLanguage, file.name);
      await loadData();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="page page-padded">
        <p>{t("exportViewer.loading")}</p>
      </div>
    );
  }

  const activeLangLabel = languages.find((l) => l.folderSuffix === selectedLanguage)?.label || selectedLanguage;

  return (
    <div className="page">
      {confirmDialog}
      
      {/* Titlebar / Breadcrumbs */}
      <div className="canvas-titlebar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to={`/volumes/${encodeURIComponent(volumeId)}`} className="canvas-titlebar-link" style={{ textDecoration: "none" }}>
          <span className="canvas-titlebar-name">{t("exportViewer.title")}</span>
          <span className="canvas-titlebar-path">/{project ? `${project.name}/${volumeId}` : volumeId}</span>
        </Link>
        <button type="button" onClick={() => navigate(`/volumes/${encodeURIComponent(volumeId)}`)}>
          {t("common.close")}
        </button>
      </div>

      {error && <div className="error-banner" style={{ margin: "10px 12px 0" }}>{error}</div>}

      <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
        {/* Sidebar: Languages list */}
        <div style={{ width: 220, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: 16, gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {t("exportViewer.selectLanguage")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {languages.map((lang) => {
              const hasExports = exportsSummary?.some((e) => e.folderSuffix === lang.folderSuffix && e.files.length > 0);
              return (
                <button
                  key={lang.code}
                  type="button"
                  className={selectedLanguage === lang.folderSuffix ? "primary" : ""}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" }}
                  onClick={() => {
                    setSelectedLanguage(lang.folderSuffix);
                    setError(null);
                  }}
                >
                  <span>{lang.label}</span>
                  {hasExports && (
                    <span style={{ fontSize: 10, background: selectedLanguage === lang.folderSuffix ? "rgba(0,0,0,0.2)" : "var(--border)", padding: "2px 6px", borderRadius: 10 }}>
                      {exportsSummary?.find((e) => e.folderSuffix === lang.folderSuffix)?.files.length ?? 0}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: 16 }}>
          {!currentSummary || currentSummary.files.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 400 }}>
              <h3 style={{ marginBottom: 8 }}>{t("exportViewer.noExportsTitle")}</h3>
              <p className="hint" style={{ marginBottom: 16 }}>{t("exportViewer.noExportsDesc")}</p>
              <Link to={`/volumes/${encodeURIComponent(volumeId)}`} className="button" style={{ display: "inline-block", textDecoration: "none" }}>
                {t("script.backToPages")}
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              {/* Toolbar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{activeLangLabel}</span>
                  <span className="hint" style={{ marginLeft: 8 }}>({currentSummary.folderName})</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <a
                    href={api.exportFolderZipUrl(volumeId, selectedLanguage)}
                    className="button"
                    style={{ textDecoration: "none", color: "var(--text)" }}
                  >
                    {t("exportViewer.downloadZip")}
                  </a>
                  {hasAtLeast("letterer") && (
                    <button type="button" className="danger" onClick={handleDeleteFolder} disabled={busy}>
                      {t("exportViewer.deleteFolder")}
                    </button>
                  )}
                </div>
              </div>

              {/* Pages Grid */}
              <div className="page-scroll" style={{ flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "8px 12px", width: "100px" }}>{t("exportViewer.page")}</th>
                      <th style={{ padding: "8px 12px", width: "120px" }}>Preview</th>
                      <th style={{ padding: "8px 12px" }}>Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages?.map((p) => {
                      const pageFiles = filesMap.get(p.page) || [];
                      const pngFile = pageFiles.find((f) => f.extension === ".png");
                      return (
                        <tr key={p.page} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                          <td style={{ padding: "12px", fontWeight: 600 }}>{p.page}</td>
                          <td style={{ padding: "12px" }}>
                            {pngFile ? (
                              <img
                                src={api.exportFileUrl(volumeId, selectedLanguage, pngFile.name)}
                                alt=""
                                style={{ width: 80, height: "auto", borderRadius: 4, cursor: "pointer", border: "1px solid var(--border)" }}
                                onClick={() => setInspectingFile(pngFile)}
                                title={t("exportViewer.inspect")}
                              />
                            ) : (
                              <div style={{ width: 80, height: 110, background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "1px dashed var(--border)", color: "var(--text-muted)", fontSize: 11 }}>
                                No PNG
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "12px" }}>
                            {pageFiles.length === 0 ? (
                              <span className="hint">No exports</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {pageFiles.map((file) => (
                                  <div key={file.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.01)", padding: "6px 12px", borderRadius: 4, border: "1px solid var(--border)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{
                                        fontWeight: 600,
                                        fontSize: 10,
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        background: file.extension === ".png" ? "#1b5e20" : file.extension === ".pdf" ? "#b71c1c" : file.extension === ".psd" ? "#0d47a1" : "#e65100"
                                      }}>
                                        {file.extension.slice(1).toUpperCase()}
                                      </span>
                                      <span style={{ fontFamily: "monospace", fontSize: 13 }}>{file.name}</span>
                                      <span className="hint" style={{ fontSize: 11 }}>({formatSize(file.size)})</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      {file.extension === ".png" && (
                                        <button type="button" onClick={() => setInspectingFile(file)}>
                                          {t("exportViewer.inspect")}
                                        </button>
                                      )}
                                      <a
                                        href={api.exportFileDownloadUrl(volumeId, selectedLanguage, file.name)}
                                        className="button"
                                        style={{ textDecoration: "none", color: "var(--text)" }}
                                      >
                                        {t("exportViewer.download")}
                                      </a>
                                      {hasAtLeast("letterer") && (
                                        <button type="button" className="danger" onClick={() => handleDeleteFile(file)} disabled={busy}>
                                          {t("exportViewer.delete")}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inspect Comparison Modal */}
      {inspectingFile && (
        <CompareModal
          page={inspectingFile.page}
          originalUrl={api.pageImageUrl(volumeId, inspectingFile.page)}
          exportedUrl={api.exportFileUrl(volumeId, selectedLanguage, inspectingFile.name)}
          langLabel={activeLangLabel}
          onClose={() => setInspectingFile(null)}
        />
      )}
    </div>
  );
}

interface CompareModalProps {
  page: string;
  originalUrl: string;
  exportedUrl: string;
  langLabel: string;
  onClose: () => void;
}

function CompareModal({ page, originalUrl, exportedUrl, langLabel, onClose }: CompareModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"side-by-side" | "overlay">("side-by-side");
  const [overlayPos, setOverlayPos] = useState<number>(50);

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.85)",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column",
      padding: 20
    }}>
      {/* Modal Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {t("exportViewer.compareTitle", { page })}
        </div>
        
        {/* Toggle Mode */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={mode === "side-by-side" ? "primary" : ""}
            onClick={() => setMode("side-by-side")}
          >
            {t("exportViewer.modeSideBySide")}
          </button>
          <button
            type="button"
            className={mode === "overlay" ? "primary" : ""}
            onClick={() => setMode("overlay")}
          >
            {t("exportViewer.modeOverlay")}
          </button>
        </div>

        <button type="button" onClick={onClose}>
          {t("exportViewer.close")}
        </button>
      </div>

      {/* Modal Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", overflow: "hidden", minHeight: 0 }}>
        {mode === "side-by-side" ? (
          <div style={{ display: "flex", gap: 20, width: "100%", height: "100%", justifyContent: "center", minHeight: 0 }}>
            {/* Original */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, alignItems: "center" }}>
              <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 13, color: "var(--text-muted)" }}>
                {t("exportViewer.originalScan")}
              </div>
              <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--border)", borderRadius: 4, background: "#000", width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <img src={originalUrl} alt="" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
              </div>
            </div>

            {/* Exported */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, alignItems: "center" }}>
              <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 13, color: "var(--text-muted)" }}>
                {t("exportViewer.exportedImage", { lang: langLabel })}
              </div>
              <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--border)", borderRadius: 4, background: "#000", width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                <img src={exportedUrl} alt="" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", alignItems: "center", minHeight: 0 }}>
            {/* Overlay Viewport */}
            <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 4, background: "#000", width: "100%", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
              <div style={{ position: "relative", height: "95%", width: "auto", display: "inline-block", aspectRatio: "inherit" }}>
                {/* Back Layer: Original image */}
                <img src={originalUrl} alt="" style={{ height: "100%", width: "auto", display: "block", userSelect: "none" }} />
                
                {/* Front Layer: Exported image clipped */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: "100%",
                  overflow: "hidden",
                  clipPath: `inset(0 ${100 - overlayPos}% 0 0)`
                }}>
                  <img src={exportedUrl} alt="" style={{ height: "100%", width: "auto", display: "block", maxWidth: "none", userSelect: "none" }} />
                </div>

                {/* Vertical Divider Indicator */}
                <div style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${overlayPos}%`,
                  width: "2px",
                  background: "var(--accent)",
                  boxShadow: "0 0 8px rgba(0,0,0,0.5)",
                  pointerEvents: "none"
                }}>
                  <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    border: "2px solid #fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#12131a",
                    fontWeight: "bold",
                    fontSize: 10,
                    cursor: "ew-resize"
                  }}>
                    ↔
                  </div>
                </div>
              </div>
            </div>

            {/* Slider Control */}
            <div style={{ width: "100%", maxWidth: 600, padding: "12px 0 0" }}>
              <input
                type="range"
                min="0"
                max="100"
                value={overlayPos}
                onChange={(e) => setOverlayPos(Number(e.target.value))}
                style={{ width: "100%", cursor: "pointer", accentColor: "var(--accent)" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
