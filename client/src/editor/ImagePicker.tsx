import { useEffect, useRef, useState } from "react";
import { api, type ImageEntry } from "../api/client";
import { ImageToolIcon } from "./Icons";

interface Props {
  onInsert: (fileName: string, width: number, height: number) => void;
  /** Renders the trigger as a bare icon (for the narrow ToolStrip) instead of the
   * text-labelled "+ Bild" button — popover behavior/state is unchanged. */
  iconOnly?: boolean;
}

/** Toolbar popover: pick an already-uploaded image to place, or upload a new one. */
export function ImagePicker({ onInsert, iconOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setImages(await api.listImages());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await api.uploadImage(file);
      await refresh();
      onInsert(result.fileName, result.width, result.height);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handlePick(img: ImageEntry) {
    onInsert(img.fileName, img.width, img.height);
    setOpen(false);
  }

  return (
    <div className="language-manager">
      <button
        onClick={() => setOpen((o) => !o)}
        className={iconOnly ? `tool-btn${open ? " active" : ""}` : open ? "active" : ""}
        title="Bild einfügen"
      >
        {iconOnly ? <ImageToolIcon /> : "+ Bild"}
      </button>
      {open && (
        <div className="language-manager-panel image-picker-panel">
          {(["project", "global"] as const).map((scope) => {
            const scoped = images.filter((img) => img.scope === scope);
            if (scoped.length === 0) return null;
            return (
              <div key={scope}>
                <p className="report-heading" style={{ margin: "4px 0" }}>
                  {scope === "project" ? "Projekt" : "Gemeinsam"}
                </p>
                <div className="image-picker-grid">
                  {scoped.map((img) => (
                    <button key={img.fileName} className="image-picker-thumb" onClick={() => handlePick(img)} title={img.fileName}>
                      <img src={img.url} alt={img.fileName} loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {images.length === 0 && <p className="hint">Noch keine Bilder hochgeladen.</p>}
          <label className="image-picker-upload">
            {uploading ? "Lädt hoch…" : "Neues Bild hochladen"}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/webp,image/jpeg,image/gif"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
          {error && <div className="language-manager-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
