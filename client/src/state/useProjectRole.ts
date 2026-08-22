import { PROJECT_ROLE_RANK, type ProjectRole } from "../../../shared/src/users";
import { useProject } from "./ProjectContext";

/** Reads the caller's own resolved role in the currently active project (the server
 * computes it, see routes/project.ts's GET /current) and exposes a simple "at least
 * this role" check for gating UI — mirrors PROJECT_ROLE_RANK's server-side use in
 * requireProjectRole(). "system-admin" always passes; "none" (authenticated but not a
 * project member) never does. */
export function useProjectRole() {
  const { project } = useProject();
  const myRole = project?.myRole ?? "none";

  function hasAtLeast(min: ProjectRole): boolean {
    if (myRole === "system-admin") return true;
    if (myRole === "none") return false;
    return PROJECT_ROLE_RANK[myRole] >= PROJECT_ROLE_RANK[min];
  }

  return { myRole, hasAtLeast };
}
