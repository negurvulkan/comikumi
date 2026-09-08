import { useState } from "react";
import { useTranslation } from "react-i18next";
import { assetLibraries, type ImageEntry } from "../api/client";
import { ImageToolIcon } from "./Icons";
import { joinFolder } from "./assetFolders";
import { AssetBrowser } from "./AssetBrowser";

interface Props {
  onInsert: (fileName: string, width: number, height: number) => void;
  /** Renders the trigger as a bare icon (for the narrow ToolStrip) instead of the
   * text-labelled "+ Bild" button — popover behavior/state is unchanged. */
  iconOnly?: boolean;
  disabled?: boolean;
}

/** Toolbar popover: pick an already-uploaded image to place, or upload a new one — a
 * thin wrapper around AssetBrowser (folder browsing/upload/pick, see its own doc
 * comment) that owns only the popover's open/closed state and adapts AssetBrowser's
 * generic `onPick(entry, folder)` to this component's own `onInsert(fileName, width,
 * height)` contract — `fileName` there is the full "/"-joined relative path (see
 * api.imagesFileUrl()'s contract), not just the leaf name, so the placed reference keeps
 * resolving even from inside a folder. */
export function ImagePicker({ onInsert, iconOnly, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="language-manager">
      <button
        onClick={() => setOpen((o) => !o)}
        className={iconOnly ? `tool-btn${open ? " active" : ""}` : open ? "active" : ""}
        title={t("editor.imagePicker.insertImage")}
        disabled={disabled}
      >
        {iconOnly ? <ImageToolIcon /> : t("editor.imagePicker.addShort")}
      </button>
      {open && (
        <div className="language-manager-panel image-picker-panel">
          <AssetBrowser<ImageEntry>
            assetApi={assetLibraries.images}
            uploadAccept="image/png,image/webp,image/jpeg,image/gif"
            uploadLabel={t("editor.imagePicker.uploadNew")}
            uploadingLabel={t("editor.imagePicker.uploading")}
            emptyLabel={t("editor.imagePicker.empty")}
            renderThumb={(img) => <img src={img.url} alt={img.fileName} loading="lazy" />}
            onPick={(entry, folder) => {
              onInsert(joinFolder(folder, entry.fileName), entry.width, entry.height);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
