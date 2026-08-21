import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ImageElement } from "../../../shared/src/layoutSchema";
import { api, type ImageEntry } from "../api/client";

interface Props {
  element: ImageElement;
  activeLanguage: string;
  activeLanguageLabel: string;
  onChange: (patch: Partial<ImageElement>) => void;
  onDelete: () => void;
}

export function ImageInspector({ element, activeLanguage, activeLanguageLabel, onChange, onDelete }: Props) {
  const { t } = useTranslation();
  const [library, setLibrary] = useState<ImageEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listImages().then(setLibrary);
  }, []);

  const currentFile = element.files[activeLanguage];

  function assign(fileName: string) {
    onChange({ files: { ...element.files, [activeLanguage]: fileName } });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadImage(file);
      setLibrary(await api.listImages());
      assign(result.fileName);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="inspector">
      <label>
        {t("editor.imageInspector.imageForLanguage", { language: activeLanguageLabel })}
        <select value={currentFile ?? ""} onChange={(e) => assign(e.target.value)}>
          {!currentFile && <option value="">{t("editor.imageInspector.noImage")}</option>}
          {library.map((img) => (
            <option key={img.fileName} value={img.fileName}>
              {img.fileName}
            </option>
          ))}
        </select>
      </label>

      {currentFile && (
        <img
          src={api.imagesFileUrl(currentFile)}
          alt={currentFile}
          style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)" }}
        />
      )}

      <label className="image-picker-upload" style={{ textAlign: "left" }}>
        {uploading ? t("editor.imagePicker.uploading") : t("editor.imageInspector.uploadForLanguage", { language: activeLanguageLabel })}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/webp,image/jpeg,image/gif"
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </label>

      <label>
        {t("editor.imageInspector.opacityLabel", { percent: Math.round(element.opacity * 100) })}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={element.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
        />
      </label>

      <p className="hint" style={{ margin: 0 }}>
        {t("editor.imageInspector.dragHint")}
      </p>

      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.imageInspector.deleteElement")}
      </button>
    </div>
  );
}
