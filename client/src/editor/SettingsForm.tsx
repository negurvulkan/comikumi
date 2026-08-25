import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import type { ProjectSettings } from "../../../shared/src/settings";
import { useProject } from "../state/ProjectContext";
import { FileBrowserModal } from "./FileBrowserModal";

interface Props {
  /** Omitted when rendered as a full route (Settings.tsx) instead of inside a Modal. */
  onClose?: () => void;
}

/** The actual settings form, shared between the standalone /settings route and the
 * "Einstellungen" entry in the Bearbeiten menu, which opens this inside a Modal —
 * same fields, same save logic, just a different frame around it. */
export function SettingsForm({ onClose }: Props) {
  const { t } = useTranslation();
  const { project } = useProject();
  const [settings, setSettings] = useState<
    (ProjectSettings & { scanRootExists: boolean; assetsDirExists: boolean; thumbnailsDirExists: boolean }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browsingAssetsDir, setBrowsingAssetsDir] = useState(false);
  const [browsingThumbnailsDir, setBrowsingThumbnailsDir] = useState(false);
  const [browsingCoverImage, setBrowsingCoverImage] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings).catch((e) => setError(translateApiError(e, t)));
  }, [t]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const {
        scanRoot,
        assetsDir,
        thumbnailsDir,
        emptySuffix,
        letteringSuffix,
        scriptSuffix,
        commentsSuffix,
        exportFolderTemplate,
        description,
        coverImagePath,
        autosaveEnabled,
        autosaveIntervalSeconds,
        readingDirection,
        trashRetentionDays,
      } = settings;
      const next = await api.updateSettings({
        scanRoot,
        assetsDir,
        thumbnailsDir,
        emptySuffix,
        letteringSuffix,
        scriptSuffix,
        commentsSuffix,
        exportFolderTemplate,
        description,
        coverImagePath,
        autosaveEnabled,
        autosaveIntervalSeconds,
        readingDirection,
        trashRetentionDays,
      });
      setSettings(next);
      setSavedMsg(t("settings.savedMsg"));
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <div className="error-banner">{error}</div>;
  if (!settings) return <p>{t("settings.loading")}</p>;

  return (
    <>
    <form onSubmit={handleSave} className="inspector" style={{ maxWidth: 420 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        {project ? t("settings.headingWithProject", { name: project.name }) : t("settings.heading")}
      </p>

      <label>
        {t("settings.descriptionLabel")}
        <textarea
          value={settings.description}
          onChange={(e) => setSettings({ ...settings, description: e.target.value })}
          placeholder={t("settings.descriptionPlaceholder")}
        />
      </label>

      <label>
        {t("settings.coverImagePathLabel")}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            value={settings.coverImagePath}
            onChange={(e) => setSettings({ ...settings, coverImagePath: e.target.value })}
            placeholder={t("settings.coverImagePathPlaceholder")}
          />
          <button type="button" onClick={() => setBrowsingCoverImage(true)}>
            {t("common.browse")}
          </button>
          {settings.coverImagePath && (
            <button type="button" onClick={() => setSettings({ ...settings, coverImagePath: "" })}>
              {t("settings.coverImagePathClear")}
            </button>
          )}
        </div>
      </label>
      {settings.coverImagePath && (
        <img
          src={api.projectCoverUrl(settings.coverImagePath)}
          alt=""
          style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
        />
      )}
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.coverImagePathHint")}</p>

      <label>
        {t("settings.scanRootLabel")}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            value={settings.scanRoot}
            onChange={(e) => setSettings({ ...settings, scanRoot: e.target.value })}
            placeholder={t("settings.scanRootPlaceholder")}
            required
          />
          <button type="button" onClick={() => setBrowsing(true)}>
            {t("common.browse")}
          </button>
        </div>
      </label>
      {!settings.scanRootExists && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.folderNotFound")}</p>
      )}
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
        {t("settings.scanRootHint", { emptySuffix: settings.emptySuffix })}
      </p>

      <label>
        {t("settings.assetsDirLabel")}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            value={settings.assetsDir}
            onChange={(e) => setSettings({ ...settings, assetsDir: e.target.value })}
            placeholder={t("settings.assetsDirPlaceholder")}
          />
          <button type="button" onClick={() => setBrowsingAssetsDir(true)}>
            {t("common.browse")}
          </button>
        </div>
      </label>
      {settings.assetsDir && !settings.assetsDirExists && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.folderNotFound")}</p>
      )}
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.assetsDirHint")}</p>

      <label>
        {t("settings.thumbnailsDirLabel")}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            value={settings.thumbnailsDir}
            onChange={(e) => setSettings({ ...settings, thumbnailsDir: e.target.value })}
            placeholder={t("settings.thumbnailsDirPlaceholder")}
          />
          <button type="button" onClick={() => setBrowsingThumbnailsDir(true)}>
            {t("common.browse")}
          </button>
        </div>
      </label>
      {settings.thumbnailsDir && !settings.thumbnailsDirExists && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.folderNotFound")}</p>
      )}
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.thumbnailsDirHint")}</p>

      <label>
        {t("settings.emptySuffixLabel")}
        <input
          value={settings.emptySuffix}
          onChange={(e) => setSettings({ ...settings, emptySuffix: e.target.value })}
          placeholder="_empty"
          required
        />
      </label>

      <label>
        {t("settings.letteringSuffixLabel")}
        <input
          value={settings.letteringSuffix}
          onChange={(e) => setSettings({ ...settings, letteringSuffix: e.target.value })}
          placeholder="_lettering"
          required
        />
      </label>

      <label>
        {t("settings.scriptSuffixLabel")}
        <input
          value={settings.scriptSuffix}
          onChange={(e) => setSettings({ ...settings, scriptSuffix: e.target.value })}
          placeholder="_script"
          required
        />
      </label>

      <label>
        {t("settings.exportTemplateLabel")}
        <input
          value={settings.exportFolderTemplate}
          onChange={(e) => setSettings({ ...settings, exportFolderTemplate: e.target.value })}
          placeholder="{book}_{folderSuffix}"
          required
        />
      </label>
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
        {t("settings.exportTemplateHintPrefix")} <code>{"{book}"}</code> {t("settings.exportTemplateHintMiddle")}{" "}
        <code>{"{folderSuffix}"}</code> {t("settings.exportTemplateHintSuffix")}
      </p>

      <label>
        {t("settings.readingDirectionLabel")}
        <select
          value={settings.readingDirection}
          onChange={(e) => setSettings({ ...settings, readingDirection: e.target.value as "ltr" | "rtl" })}
        >
          <option value="rtl">{t("settings.readingDirectionRtl")}</option>
          <option value="ltr">{t("settings.readingDirectionLtr")}</option>
        </select>
      </label>
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.readingDirectionHint")}</p>

      <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.autosaveEnabled}
          onChange={(e) => setSettings({ ...settings, autosaveEnabled: e.target.checked })}
        />
        {t("settings.autosaveEnabledLabel")}
      </label>
      {settings.autosaveEnabled && (
        <label>
          {t("settings.autosaveIntervalLabel")}
          <input
            type="number"
            min={5}
            max={3600}
            value={settings.autosaveIntervalSeconds}
            onChange={(e) => setSettings({ ...settings, autosaveIntervalSeconds: Number(e.target.value) })}
          />
        </label>
      )}

      <label>
        {t("settings.trashRetentionDaysLabel")}
        <input
          type="number"
          min={1}
          value={settings.trashRetentionDays}
          onChange={(e) => setSettings({ ...settings, trashRetentionDays: Number(e.target.value) })}
        />
      </label>
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>{t("settings.trashRetentionDaysHint")}</p>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? t("settings.saving") : t("common.save")}
        </button>
        {onClose && (
          <button type="button" onClick={onClose}>
            {t("common.close")}
          </button>
        )}
      </div>
      {savedMsg && <p style={{ color: "#b3ffc0", margin: 0 }}>{savedMsg}</p>}
      {error && <div className="error-banner">{error}</div>}
    </form>
    {browsing && (
      <FileBrowserModal
        mode="directory"
        startPath={settings.scanRoot}
        onSelect={(path) => {
          setSettings({ ...settings, scanRoot: path });
          setBrowsing(false);
        }}
        onClose={() => setBrowsing(false)}
      />
    )}
    {browsingAssetsDir && (
      <FileBrowserModal
        mode="directory"
        startPath={settings.assetsDir || settings.scanRoot}
        onSelect={(path) => {
          setSettings({ ...settings, assetsDir: path });
          setBrowsingAssetsDir(false);
        }}
        onClose={() => setBrowsingAssetsDir(false)}
      />
    )}
    {browsingThumbnailsDir && (
      <FileBrowserModal
        mode="directory"
        startPath={settings.thumbnailsDir || settings.scanRoot}
        onSelect={(path) => {
          setSettings({ ...settings, thumbnailsDir: path });
          setBrowsingThumbnailsDir(false);
        }}
        onClose={() => setBrowsingThumbnailsDir(false)}
      />
    )}
    {browsingCoverImage && (
      <FileBrowserModal
        mode="file"
        fileFilter="image"
        startPath={settings.scanRoot}
        onSelect={(path) => {
          setSettings({ ...settings, coverImagePath: path });
          setBrowsingCoverImage(false);
        }}
        onClose={() => setBrowsingCoverImage(false)}
      />
    )}
    </>
  );
}
