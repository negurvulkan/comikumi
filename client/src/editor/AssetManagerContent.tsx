import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AssetManagerPanel } from "./AssetManagerPanel";

interface Props {
  /** Whether mutating controls (upload/delete/rename/move) should be enabled — the
   * caller resolves this from useProjectRole()'s hasAtLeast("letterer"), matching the
   * server's own requireProjectRole("letterer") on every asset-mutating route. Any
   * project member can still open this to browse. */
  canEdit: boolean;
  /** Shows a "manage shared library" link to the instance-scope tab in AdminDashboard.tsx
   * — only meaningful (and only shown) for a system admin. */
  isSystemAdmin: boolean;
  onClose: () => void;
}

/** The Asset Manager's actual content (title, hint, project-vs-shared-library link, the
 * Fonts/Images/Bubble-SVGs tabs) — shared by every place it can be opened from: as a
 * large inline panel in VolumeList.tsx (see that file's own doc comment on why it's NOT
 * wrapped in the generic Modal.tsx there), and inside a plain <Modal> everywhere else
 * (Editor.tsx/PageGrid.tsx/ProjectSwitcher.tsx), same as CharacterManager.tsx/
 * PresetManager.tsx/GlossaryManager.tsx already do. Always renders its own header row
 * with a close button (not just relying on Modal's backdrop-click-to-close) and listens
 * for Escape itself, so both hosting styles behave identically. */
export function AssetManagerContent({ canEdit, isSystemAdmin, onClose }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 auto", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{t("assetManager.title")}</h2>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            {t("assetManager.projectScopeHint")}
          </p>
        </div>
        <button type="button" onClick={onClose} title={t("common.cancel")}>
          ×
        </button>
      </div>
      {isSystemAdmin && (
        <Link to="/admin?tab=assets" style={{ display: "inline-block", fontSize: 12 }}>
          {t("assetManager.manageSharedLibraryLink")}
        </Link>
      )}
      <div className="page-scroll" style={{ flex: "1 1 auto", minHeight: 0 }}>
        <AssetManagerPanel scope="project" canEdit={canEdit} />
      </div>
    </div>
  );
}
