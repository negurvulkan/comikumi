import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { invalidateFontsCache } from "../editor/fontLoader";
import { FileBrowserModal } from "../editor/FileBrowserModal";

interface WizardLanguage {
  code: string;
  label: string;
  folderSuffix: string;
}

/** One content-language guess per supported UI locale (client/src/i18n/locales/*.json) —
 * ComiKumi is a general-purpose tool, not just for Keito no Sei's DE/EN/JP project, so
 * defaulting to three languages would hand every new user two they likely don't need.
 * Multi-language support stays fully available (this step's list is freely editable),
 * it's just opt-in via "+ Sprache hinzufügen" instead of pre-populated. Japanese keeps
 * the "jp" content-language code (not "ja") to match the existing folder/character
 * convention used elsewhere in the app (e.g. shared/src/languages.ts's DEFAULT_LANGUAGES). */
const CONTENT_LANGUAGE_BY_UI_LOCALE: Record<string, WizardLanguage> = {
  en: { code: "en", label: "English", folderSuffix: "english" },
  de: { code: "de", label: "Deutsch", folderSuffix: "german" },
  ja: { code: "jp", label: "日本語", folderSuffix: "japanese" },
  fr: { code: "fr", label: "Français", folderSuffix: "french" },
  es: { code: "es", label: "Español", folderSuffix: "spanish" },
  zh: { code: "zh", label: "中文", folderSuffix: "chinese" },
  ko: { code: "ko", label: "한국어", folderSuffix: "korean" },
};

function guessInitialLanguage(uiLanguage: string): WizardLanguage {
  const base = uiLanguage.split("-")[0].toLowerCase();
  return CONTENT_LANGUAGE_BY_UI_LOCALE[base] ?? CONTENT_LANGUAGE_BY_UI_LOCALE.en;
}

interface WizardVolume {
  bookName: string;
  createdPaths: string[];
}

type BrowserTarget = "scanRoot" | "filePath" | null;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const STEP_COUNT = 5;

/** Five-step guided replacement for the old single-form "new project" flow on
 * ProjectSwitcher.tsx: basics, folder-naming convention, initial languages, optional
 * first volume folders (created immediately on disk, not deferred to the final
 * submit), then a review step that actually calls api.createProject(). */
export function ProjectWizard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserTarget, setBrowserTarget] = useState<BrowserTarget>(null);

  // Step 1 — basics
  const [name, setName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [scanRoot, setScanRoot] = useState("");
  const [scanRootStatus, setScanRootStatus] = useState<{ exists: boolean; volumeCount: number } | null>(null);
  const [checkingScanRoot, setCheckingScanRoot] = useState(false);

  // Step 2 — folder-naming convention
  const [emptySuffix, setEmptySuffix] = useState("_empty");
  const [letteringSuffix, setLetteringSuffix] = useState("_lettering");
  const [scriptSuffix, setScriptSuffix] = useState("_script");
  const [exportFolderTemplate, setExportFolderTemplate] = useState("{book}_{folderSuffix}");

  // Step 3 — languages, defaulting to just one guessed from the current UI language
  // rather than a fixed multi-language set — see guessInitialLanguage() above.
  const [languages, setLanguages] = useState<WizardLanguage[]>(() => [guessInitialLanguage(i18n.language)]);
  const [newLangLabel, setNewLangLabel] = useState("");
  const [newLangCode, setNewLangCode] = useState("");
  const [newLangFolderSuffix, setNewLangFolderSuffix] = useState("");
  const [langFolderSuffixTouched, setLangFolderSuffixTouched] = useState(false);

  // Step 4 — first volumes
  const [volumes, setVolumes] = useState<WizardVolume[]>([]);
  const [newVolumeName, setNewVolumeName] = useState("");
  const [newVolumeLangs, setNewVolumeLangs] = useState<Set<string>>(() => new Set(languages.map((l) => l.folderSuffix)));
  const [creatingVolume, setCreatingVolume] = useState(false);

  async function checkScanRoot() {
    if (!scanRoot.trim()) return;
    setCheckingScanRoot(true);
    setError(null);
    try {
      setScanRootStatus(await api.getScanRootStatus(scanRoot.trim(), emptySuffix.trim() || "_empty"));
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setCheckingScanRoot(false);
    }
  }

  async function handleCreateScanRoot() {
    setBusy(true);
    setError(null);
    try {
      await api.createScanRootFolder(scanRoot.trim());
      await checkScanRoot();
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  function handleNewLangLabelChange(value: string) {
    setNewLangLabel(value);
    if (!langFolderSuffixTouched) setNewLangFolderSuffix(slugify(value));
  }

  function handleAddLanguage(e: React.FormEvent) {
    e.preventDefault();
    const lang: WizardLanguage = {
      code: newLangCode.trim(),
      label: newLangLabel.trim(),
      folderSuffix: newLangFolderSuffix.trim() || slugify(newLangCode),
    };
    if (!lang.code || !lang.label || !lang.folderSuffix) return;
    setLanguages((prev) => [...prev, lang]);
    setNewVolumeLangs((prev) => new Set(prev).add(lang.folderSuffix));
    setNewLangLabel("");
    setNewLangCode("");
    setNewLangFolderSuffix("");
    setLangFolderSuffixTouched(false);
  }

  function handleRemoveLanguage(code: string) {
    setLanguages((prev) => prev.filter((l) => l.code !== code));
  }

  function toggleNewVolumeLang(folderSuffix: string) {
    setNewVolumeLangs((prev) => {
      const next = new Set(prev);
      if (next.has(folderSuffix)) next.delete(folderSuffix);
      else next.add(folderSuffix);
      return next;
    });
  }

  async function handleCreateVolume(e: React.FormEvent) {
    e.preventDefault();
    if (!newVolumeName.trim()) return;
    setCreatingVolume(true);
    setError(null);
    try {
      const result = await api.createVolumeFolders({
        scanRoot: scanRoot.trim(),
        emptySuffix: emptySuffix.trim(),
        bookName: newVolumeName.trim(),
        languageFolderSuffixes: [...newVolumeLangs],
      });
      setVolumes((prev) => [...prev, { bookName: newVolumeName.trim(), createdPaths: result.createdPaths }]);
      setNewVolumeName("");
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setCreatingVolume(false);
    }
  }

  function handleRemoveVolumeFromList(index: number) {
    setVolumes((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleFinish() {
    setBusy(true);
    setError(null);
    try {
      await api.createProject({
        filePath: filePath.trim(),
        name: name.trim(),
        scanRoot: scanRoot.trim(),
        emptySuffix: emptySuffix.trim(),
        letteringSuffix: letteringSuffix.trim(),
        scriptSuffix: scriptSuffix.trim(),
        exportFolderTemplate: exportFolderTemplate.trim(),
        languages: languages.map(({ code, label, folderSuffix }) => ({ code, label, folderSuffix })),
      });
      invalidateFontsCache();
      navigate("/");
    } catch (e) {
      setError(translateApiError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const canGoNext =
    (step === 0 && name.trim() && filePath.trim() && scanRoot.trim()) ||
    (step === 1 && emptySuffix.trim() && letteringSuffix.trim() && scriptSuffix.trim() && exportFolderTemplate.trim()) ||
    (step === 2 && languages.length > 0) ||
    step === 3;

  function handleBrowserSelect(selectedPath: string) {
    if (browserTarget === "scanRoot") {
      setScanRoot(selectedPath);
      setScanRootStatus(null);
    } else if (browserTarget === "filePath") {
      setFilePath(`${selectedPath}\\projekt.json`);
    }
    setBrowserTarget(null);
  }

  return (
    <div className="page page-padded">
      <div className="page-scroll" style={{ maxWidth: 560 }}>
        <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 16 }}>{t("projectWizard.heading")}</p>
        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: 13 }}>
          {t("projectWizard.stepIndicator", { step: step + 1, total: STEP_COUNT })}
        </p>
        {error && <div className="error-banner">{error}</div>}

        {step === 0 && (
          <div className="inspector">
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectWizard.step1Heading")}</p>
            <label>
              {t("managers.characters.nameLabel")}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("projectSwitcher.namePlaceholder")} required />
            </label>
            <label>
              {t("projectSwitcher.saveAsLabel")}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ flex: 1 }}
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder={t("projectSwitcher.filePathPlaceholder")}
                  required
                />
                <button type="button" onClick={() => setBrowserTarget("filePath")}>
                  {t("common.browse")}
                </button>
              </div>
            </label>
            <label>
              {t("projectSwitcher.scanRootLabel")}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ flex: 1 }}
                  value={scanRoot}
                  onChange={(e) => {
                    setScanRoot(e.target.value);
                    setScanRootStatus(null);
                  }}
                  onBlur={checkScanRoot}
                  placeholder={t("settings.scanRootPlaceholder")}
                  required
                />
                <button type="button" onClick={() => setBrowserTarget("scanRoot")}>
                  {t("common.browse")}
                </button>
              </div>
            </label>
            {checkingScanRoot && <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>{t("common.loading")}</p>}
            {!checkingScanRoot && scanRootStatus && scanRootStatus.exists && (
              <p style={{ color: "#b3ffc0", fontSize: 12, margin: 0 }}>
                {t("projectWizard.scanRootFoundVolumes", { count: scanRootStatus.volumeCount })}
              </p>
            )}
            {!checkingScanRoot && scanRootStatus && !scanRootStatus.exists && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p style={{ color: "#ff8a95", fontSize: 12, margin: 0 }}>{t("projectWizard.scanRootMissing")}</p>
                <button type="button" onClick={handleCreateScanRoot} disabled={busy}>
                  {t("projectWizard.createScanRootButton")}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="inspector">
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectWizard.step2Heading")}</p>
            <label>
              {t("settings.emptySuffixLabel")}
              <input value={emptySuffix} onChange={(e) => setEmptySuffix(e.target.value)} placeholder="_empty" required />
            </label>
            <label>
              {t("settings.letteringSuffixLabel")}
              <input value={letteringSuffix} onChange={(e) => setLetteringSuffix(e.target.value)} placeholder="_lettering" required />
            </label>
            <label>
              {t("settings.scriptSuffixLabel")}
              <input value={scriptSuffix} onChange={(e) => setScriptSuffix(e.target.value)} placeholder="_script" required />
            </label>
            <label>
              {t("settings.exportTemplateLabel")}
              <input
                value={exportFolderTemplate}
                onChange={(e) => setExportFolderTemplate(e.target.value)}
                placeholder="{book}_{folderSuffix}"
                required
              />
            </label>
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>
              {t("projectWizard.folderExamplePrefix")} <code>Volume_01{emptySuffix}</code>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="inspector">
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectWizard.step3Heading")}</p>
            <div className="language-manager-list">
              {languages.map((l) => (
                <div key={l.code} className="language-manager-row">
                  <span>
                    {l.label} <em>({l.code})</em> — <code>{l.folderSuffix}</code>
                  </span>
                  <button type="button" onClick={() => handleRemoveLanguage(l.code)} title={t("managers.languages.remove")}>
                    ×
                  </button>
                </div>
              ))}
              {languages.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("managers.languages.empty")}</p>}
            </div>
            <form onSubmit={handleAddLanguage} className="language-manager-form">
              <label>
                {t("managers.characters.nameLabel")}
                <input
                  placeholder={t("managers.languages.namePlaceholder")}
                  value={newLangLabel}
                  onChange={(e) => handleNewLangLabelChange(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("managers.languages.codeLabel")}
                <input placeholder={t("managers.languages.codePlaceholder")} value={newLangCode} onChange={(e) => setNewLangCode(e.target.value)} required />
              </label>
              <label>
                {t("managers.languages.folderSuffixLabel")}
                <input
                  placeholder={t("managers.languages.folderSuffixPlaceholder")}
                  value={newLangFolderSuffix}
                  onChange={(e) => {
                    setLangFolderSuffixTouched(true);
                    setNewLangFolderSuffix(e.target.value);
                  }}
                  required
                />
              </label>
              <button type="submit" className="primary">
                {t("common.add")}
              </button>
            </form>
          </div>
        )}

        {step === 3 && (
          <div className="inspector">
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectWizard.step4Heading")}</p>
            <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>{t("projectWizard.step4Hint")}</p>

            {volumes.length > 0 && (
              <div className="card-grid">
                {volumes.map((v, i) => (
                  <div key={i} className="card" style={{ width: "100%" }}>
                    <div className="label" style={{ color: "var(--text)" }}>
                      {v.bookName}
                    </div>
                    {v.createdPaths.map((p) => (
                      <div key={p} className="label">
                        {p}
                      </div>
                    ))}
                    <button type="button" onClick={() => handleRemoveVolumeFromList(i)}>
                      {t("projectWizard.removeFromListButton")}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleCreateVolume} className="inspector" style={{ padding: 0 }}>
              <label>
                {t("projectWizard.volumeNameLabel")}
                <input value={newVolumeName} onChange={(e) => setNewVolumeName(e.target.value)} placeholder="Volume_01" />
              </label>
              {languages.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--text-muted)" }}>{t("projectWizard.volumeLanguagesLabel")}</p>
                  {languages.map((l) => (
                    <label key={l.code} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" checked={newVolumeLangs.has(l.folderSuffix)} onChange={() => toggleNewVolumeLang(l.folderSuffix)} />
                      {l.label}
                    </label>
                  ))}
                </div>
              )}
              <button type="submit" className="primary" disabled={creatingVolume || !newVolumeName.trim()}>
                {creatingVolume ? "…" : t("projectWizard.createVolumeButton")}
              </button>
            </form>
          </div>
        )}

        {step === 4 && (
          <div className="inspector">
            <p style={{ margin: 0, fontWeight: 600 }}>{t("projectWizard.step5Heading")}</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text)" }}>
              <li>{t("projectWizard.summaryName", { name })}</li>
              <li>{t("projectWizard.summaryFilePath", { filePath })}</li>
              <li>{t("projectWizard.summaryScanRoot", { scanRoot })}</li>
              <li>
                {t("projectWizard.summaryLanguages", { languages: languages.map((l) => l.label).join(", ") })}
              </li>
              <li>{t("projectWizard.summaryVolumeCount", { count: volumes.length })}</li>
            </ul>
            <button type="button" className="primary" onClick={handleFinish} disabled={busy}>
              {busy ? t("settings.saving") : t("projectWizard.finishButton")}
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => (step === 0 ? navigate("/project") : setStep((s) => s - 1))} disabled={busy}>
            {step === 0 ? t("common.cancel") : t("projectWizard.backButton")}
          </button>
          {step < STEP_COUNT - 1 && (
            <button type="button" className="primary" onClick={() => setStep((s) => s + 1)} disabled={!canGoNext}>
              {t("projectWizard.nextButton")}
            </button>
          )}
        </div>
      </div>

      {browserTarget && (
        <FileBrowserModal mode="directory" onSelect={handleBrowserSelect} onClose={() => setBrowserTarget(null)} />
      )}
    </div>
  );
}
