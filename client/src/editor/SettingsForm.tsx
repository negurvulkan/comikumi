import { useEffect, useState } from "react";
import { api } from "../api/client";
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

  useEffect(() => {
    api.getSettings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const { scanRoot, assetsDir, thumbnailsDir, emptySuffix, letteringSuffix, exportFolderTemplate, description } = settings;
      const next = await api.updateSettings({
        scanRoot,
        assetsDir,
        thumbnailsDir,
        emptySuffix,
        letteringSuffix,
        exportFolderTemplate,
        description,
      });
      setSettings(next);
      setSavedMsg("Gespeichert.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <div className="error-banner">{error}</div>;
  if (!settings) return <p>Lade Einstellungen…</p>;

  return (
    <>
    <form onSubmit={handleSave} className="inspector" style={{ maxWidth: 420 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{project ? `Einstellungen — ${project.name}` : "Einstellungen"}</p>

      <label>
        Beschreibung
        <textarea
          value={settings.description}
          onChange={(e) => setSettings({ ...settings, description: e.target.value })}
          placeholder="Kurze Notiz zu diesem Projekt…"
        />
      </label>

      <label>
        Projekt-Ordner
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            value={settings.scanRoot}
            onChange={(e) => setSettings({ ...settings, scanRoot: e.target.value })}
            placeholder="z. B. C:\Projekte\MeinComic\Produktion"
            required
          />
          <button type="button" onClick={() => setBrowsing(true)}>
            Durchsuchen…
          </button>
        </div>
      </label>
      {!settings.scanRootExists && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 8px", fontSize: 12 }}>
          Dieser Ordner existiert (aus Sicht des Servers) nicht — bitte Pfad prüfen.
        </p>
      )}
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
        Ordner, der nach „&lt;Band&gt;{settings.emptySuffix}"-Unterordnern durchsucht wird.
      </p>

      <label>
        Projekt-Assets-Ordner
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            value={settings.assetsDir}
            onChange={(e) => setSettings({ ...settings, assetsDir: e.target.value })}
            placeholder="optional, z. B. C:\Projekte\MeinComic\Assets"
          />
          <button type="button" onClick={() => setBrowsingAssetsDir(true)}>
            Durchsuchen…
          </button>
        </div>
      </label>
      {settings.assetsDir && !settings.assetsDirExists && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 8px", fontSize: 12 }}>
          Dieser Ordner existiert (aus Sicht des Servers) nicht — bitte Pfad prüfen.
        </p>
      )}
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
        Optional. Eigene Schriften/SVG-Blasenkonturen/Bilder nur für dieses Projekt —
        ergänzt die gemeinsame Bibliothek, überschreibt sie bei Namensgleichheit. Leer
        lassen, um weiterhin nur die gemeinsame Bibliothek zu nutzen.
      </p>

      <label>
        Thumbnail-Ordner
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            value={settings.thumbnailsDir}
            onChange={(e) => setSettings({ ...settings, thumbnailsDir: e.target.value })}
            placeholder="optional, z. B. C:\Projekte\MeinComic\Thumbnails"
          />
          <button type="button" onClick={() => setBrowsingThumbnailsDir(true)}>
            Durchsuchen…
          </button>
        </div>
      </label>
      {settings.thumbnailsDir && !settings.thumbnailsDirExists && (
        <p style={{ color: "#ff8a95", margin: "-4px 0 8px", fontSize: 12 }}>
          Dieser Ordner existiert (aus Sicht des Servers) nicht — bitte Pfad prüfen.
        </p>
      )}
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
        Optional, unabhängig vom Assets-Ordner. Cache für die Seiten-Vorschaubilder. Leer
        lassen, um automatisch einen „thumbnails"-Ordner direkt neben der Projektdatei zu
        verwenden.
      </p>

      <label>
        Suffix für leere Seiten
        <input
          value={settings.emptySuffix}
          onChange={(e) => setSettings({ ...settings, emptySuffix: e.target.value })}
          placeholder="_empty"
          required
        />
      </label>

      <label>
        Suffix für Lettering-JSON
        <input
          value={settings.letteringSuffix}
          onChange={(e) => setSettings({ ...settings, letteringSuffix: e.target.value })}
          placeholder="_lettering"
          required
        />
      </label>

      <label>
        Export-Ordner-Vorlage
        <input
          value={settings.exportFolderTemplate}
          onChange={(e) => setSettings({ ...settings, exportFolderTemplate: e.target.value })}
          placeholder="{book}_{folderSuffix}"
          required
        />
      </label>
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 8px", fontSize: 12 }}>
        Platzhalter: <code>{"{book}"}</code> (Bandordner-Name), <code>{"{folderSuffix}"}</code> (aus der
        Spracheinstellung).
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Speichert…" : "Speichern"}
        </button>
        {onClose && (
          <button type="button" onClick={onClose}>
            Schließen
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
    </>
  );
}
