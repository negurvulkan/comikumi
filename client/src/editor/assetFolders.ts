/** Small, pure "/"-joined relative folder path helpers shared by ImagePicker.tsx and
 * SvgBubblePicker.tsx — both browse the same kind of folder-enabled asset library
 * (see server/src/lib/assetRouter.ts's `foldersEnabled` option) and are kept in
 * lockstep, so this avoids duplicating the same path arithmetic in both files. */

export function joinFolder(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function parentFolder(folder: string): string {
  return folder.split("/").slice(0, -1).join("/");
}

export interface FolderCrumb {
  label: string;
  path: string;
}

/** Root, then one crumb per path segment — e.g. "effects/fire" ->
 * [{label:"Root",path:""}, {label:"effects",path:"effects"}, {label:"fire",path:"effects/fire"}]. */
export function folderBreadcrumb(folder: string, rootLabel: string): FolderCrumb[] {
  const segments = folder ? folder.split("/") : [];
  const crumbs: FolderCrumb[] = [{ label: rootLabel, path: "" }];
  let cumulative = "";
  for (const segment of segments) {
    cumulative = joinFolder(cumulative, segment);
    crumbs.push({ label: segment, path: cumulative });
  }
  return crumbs;
}
