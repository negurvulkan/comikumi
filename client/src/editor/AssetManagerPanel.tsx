import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { assetLibraries, type AssetScope, type BubbleSvgEntry, type FontEntry, type ImageEntry } from "../api/client";
import { AssetBrowser } from "./AssetBrowser";
import { AssetSidebar } from "./AssetSidebar";
import type { FolderTreeApi } from "./AssetTreeFolderNode";
import { ASSET_KINDS, type AssetKind } from "./assetKinds";
import { registerFonts } from "./fontLoader";

interface Props {
  /** "instance" = the true, project-independent server library (AdminDashboard.tsx's
   * "assets" tab, system-admin only — every entry is scope "global", nothing else to
   * protect). "project" = the currently open project's own library, merged with the
   * global one for browsing (AssetManager.tsx). */
  scope: "instance" | "project";
  /** Only meaningful for `scope: "project"` — instance scope is system-admin-only to
   * even reach, so it's always fully editable there. A project member below `letterer`
   * can still open this panel to browse (see server/src/lib/auth.ts's
   * requireProjectRole("letterer") on every mutating asset route — matching that floor
   * here avoids showing controls that would just 403). */
  canEdit?: boolean;
}

/** Tabbed Fonts/Images/Bubble-SVGs asset browser, shared between the project-scope
 * Asset Manager screen (AssetManager.tsx) and the instance-scope tab inside
 * AdminDashboard.tsx — see each asset kind's own AssetBrowser instance below for what
 * differs between the two scopes (which `assetLibraries.*` object, and the project-scope
 * `canMutate` guard against accidentally touching a same-named global file). */
export function AssetManagerPanel({ scope, canEdit = true }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const kindParam = searchParams.get("kind");
  const kind: AssetKind = ASSET_KINDS.includes(kindParam as AssetKind) ? (kindParam as AssetKind) : "images";
  const folder = searchParams.get("folder") ?? "";
  const isInstance = scope === "instance";
  // Tracks which font families have finished loading via the FontFace API (registerFonts
  // is async) so a tile's glyph preview can repaint with the real font once it's ready,
  // instead of staying on the muted UI-font fallback forever.
  const [loadedFamilies, setLoadedFamilies] = useState<Set<string>>(new Set());

  const imagesApi = isInstance ? assetLibraries.instanceImages : assetLibraries.images;
  const bubbleSvgsApi = isInstance ? assetLibraries.instanceBubbleSvgs : assetLibraries.bubbleSvgs;
  const fontsApi = isInstance ? assetLibraries.instanceFonts : assetLibraries.fonts;
  const assetApiByKind: Record<AssetKind, FolderTreeApi> = { images: imagesApi, "bubble-svgs": bubbleSvgsApi, fonts: fontsApi };

  function selectNode(nextKind: AssetKind, nextFolder: string) {
    const params = new URLSearchParams(searchParams);
    params.set("kind", nextKind);
    if (nextFolder) params.set("folder", nextFolder);
    else params.delete("folder");
    setSearchParams(params, { replace: true });
  }

  // Only meaningful for scope "project" — restricts delete/rename/move to entries that
  // actually belong to THIS project, never a same-named global one (see AssetBrowser's
  // own canMutate doc comment for why this guard is required, not cosmetic).
  const projectCanMutate = (entry: { scope: AssetScope }) => entry.scope === "project";

  return (
    <div className="asset-manager-layout">
      <AssetSidebar assetApiByKind={assetApiByKind} activeKind={kind} activeFolder={folder} readOnly={!canEdit} onSelect={selectNode} />
      <div className="asset-manager-content">
      {kind === "images" && (
        <AssetBrowser<ImageEntry>
          assetApi={imagesApi}
          folder={folder}
          uploadAccept="image/png,image/webp,image/jpeg,image/gif"
          uploadLabel={t("editor.imagePicker.uploadNew")}
          uploadingLabel={t("editor.imagePicker.uploading")}
          emptyLabel={t("editor.imagePicker.empty")}
          renderThumb={(img) => <img src={img.url} alt={img.fileName} loading="lazy" />}
          showDelete
          showRename
          readOnly={!canEdit}
          canMutate={isInstance ? undefined : projectCanMutate}
        />
      )}
      {kind === "bubble-svgs" && (
        <AssetBrowser<BubbleSvgEntry>
          assetApi={bubbleSvgsApi}
          folder={folder}
          uploadAccept="image/svg+xml,.svg"
          uploadLabel={t("editor.svgPicker.uploadNew")}
          uploadingLabel={t("editor.imagePicker.uploading")}
          emptyLabel={t("editor.svgPicker.empty")}
          renderThumb={(svg) => <img src={svg.url} alt={svg.fileName} loading="lazy" />}
          showDelete
          showRename
          readOnly={!canEdit}
          canMutate={isInstance ? undefined : projectCanMutate}
        />
      )}
      {kind === "fonts" && (
        <AssetBrowser<FontEntry>
          assetApi={fontsApi}
          uploadAccept=".ttf,.otf,.woff,.woff2"
          uploadLabel={t("assetManager.uploadFont")}
          uploadingLabel={t("editor.imagePicker.uploading")}
          emptyLabel={t("assetManager.fontsEmpty")}
          // A real glyph preview: kicks off registerFonts() for this entry (idempotent,
          // deduped by family name in fontLoader.ts's own module-level Set, so calling it
          // on every render is cheap) and shows a muted UI-font fallback until it resolves,
          // then repaints in the actual font once loadedFamilies picks it up.
          renderThumb={(font) => {
            const loaded = loadedFamilies.has(font.family);
            if (!loaded) {
              registerFonts([font]).then(() => {
                setLoadedFamilies((prev) => (prev.has(font.family) ? prev : new Set(prev).add(font.family)));
              });
            }
            return (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", padding: 6, boxSizing: "border-box", overflow: "hidden" }}>
                {/* minWidth: 0 is the essential part — a flex item's default min-width:auto is
                    content-based (the full unwrapped text width), which stops it from ever
                    shrinking below that regardless of overflow:hidden/ellipsis on the item
                    itself, so long family names would overflow the flex row horizontally into
                    the next grid column instead of truncating. min-width:0 lifts that floor,
                    letting text-overflow:ellipsis actually take effect. A long name must never
                    wrap either way — wrapping grows this tile's height, which the surrounding
                    CSS grid then applies to the whole row, overlapping the row below it. */}
                <span
                  style={{
                    display: "block",
                    minWidth: 0,
                    fontSize: loaded ? 20 : 12,
                    fontFamily: loaded ? font.family : undefined,
                    color: loaded ? undefined : "var(--text-muted)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {font.family}
                </span>
              </span>
            );
          }}
          thumbExtraClassName="asset-thumb-font"
          showDelete
          showRename
          readOnly={!canEdit}
          canMutate={isInstance ? undefined : projectCanMutate}
        />
      )}
      </div>
    </div>
  );
}
