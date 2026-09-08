import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ASSET_KINDS, type AssetKind } from "./assetKinds";
import { AssetTreeFolderNode, type FolderTreeApi } from "./AssetTreeFolderNode";

interface Props {
  assetApiByKind: Record<AssetKind, FolderTreeApi>;
  activeKind: AssetKind;
  activeFolder: string;
  readOnly: boolean;
  onSelect: (kind: AssetKind, folder: string) => void;
}

/** The Asset Manager's rigid left directory-tree sidebar — one AssetTreeFolderNode per
 * kind (Bilder/SVG-Umrisse/Fonts) at depth 0, each recursing into its own subfolders.
 * Replaces the old horizontal kind-pill toolstrip AND each AssetBrowser instance's own
 * internal folder breadcrumb+chips (see AssetBrowser.tsx's `folder` prop doc comment). */
export function AssetSidebar({ assetApiByKind, activeKind, activeFolder, readOnly, onSelect }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  return (
    <nav className="asset-sidebar">
      {ASSET_KINDS.map((k) => (
        <AssetTreeFolderNode
          key={k}
          api={assetApiByKind[k]}
          kind={k}
          path=""
          name={t(`assetManager.kind.${k}`)}
          depth={0}
          activeKind={activeKind}
          activeFolder={activeFolder}
          readOnly={readOnly}
          onSelect={onSelect}
          onError={setError}
        />
      ))}
      {error && <div className="language-manager-error">{error}</div>}
    </nav>
  );
}
