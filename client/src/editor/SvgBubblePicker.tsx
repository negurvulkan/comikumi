import { useState } from "react";
import { useTranslation } from "react-i18next";
import { assetLibraries, type BubbleSvgEntry } from "../api/client";
import { joinFolder } from "./assetFolders";
import { AssetBrowser } from "./AssetBrowser";

interface Props {
  onPick: (fileName: string) => void;
}

/** Popover: pick an already-uploaded SVG bubble contour, or upload a new one — a thin
 * wrapper around AssetBrowser (folder browsing/upload/pick, see its own doc comment),
 * same shape as ImagePicker.tsx. `onPick` receives the full "/"-joined relative path
 * (see api.bubbleSvgFileUrl()'s contract), not just the leaf name, so the placed
 * reference keeps resolving even from inside a folder. */
export function SvgBubblePicker({ onPick }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="language-manager">
      <button onClick={() => setOpen((o) => !o)} className={open ? "active" : ""} title={t("editor.svgPicker.chooseSvg")}>
        {t("editor.svgPicker.chooseSvgShort")}
      </button>
      {open && (
        <div className="language-manager-panel image-picker-panel">
          <AssetBrowser<BubbleSvgEntry>
            assetApi={assetLibraries.bubbleSvgs}
            uploadAccept="image/svg+xml,.svg"
            uploadLabel={t("editor.svgPicker.uploadNew")}
            uploadingLabel={t("editor.imagePicker.uploading")}
            emptyLabel={t("editor.svgPicker.empty")}
            renderThumb={(svg) => <img src={svg.url} alt={svg.fileName} loading="lazy" />}
            onPick={(entry, folder) => {
              onPick(joinFolder(folder, entry.fileName));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
