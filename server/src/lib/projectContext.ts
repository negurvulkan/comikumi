import type { NextFunction, Request, Response } from "express";
import { PROJECT_ROLE_RANK, type ProjectRole } from "../../../shared/src/users.js";
import { getOrLoadProjectById, ProjectNotFoundError, type ActiveProject } from "./projectStore.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by resolveProjectParam for every project-scoped route
       * (`/api/p/:projectId/...`) — the resolved project this request operates on,
       * passed as `ctx` to projectStore.ts's readX/writeX functions instead of them
       * falling back to the legacy single-project singleton. Absent on not-yet-migrated
       * (still un-scoped) routes — see docs/FEATURES.md's Mehrbenutzerbetrieb section. */
      activeProject?: ActiveProject;
    }
  }
}

/** Project-scoped counterpart of auth.ts's requireAuth — must run after it (needs
 * req.user) and before any route handler that reads req.activeProject. Resolves
 * `:projectId` from the URL via projectStore.ts's multi-project cache/index and attaches
 * it to the request; 404s for an id with no registered project rather than falling back
 * to any implicit "current" project — a project-scoped route must always be explicit
 * about which project it means. */
export async function resolveProjectParam(req: Request, res: Response, next: NextFunction): Promise<void> {
  const projectId = req.params.projectId;
  if (!projectId || typeof projectId !== "string") {
    res.status(400).json({ error: "project_id_required" });
    return;
  }
  try {
    req.activeProject = await getOrLoadProjectById(projectId);
    next();
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    throw err;
  }
}

/** Project-scoped counterpart of auth.ts's requireProjectRole() — same rank check, but
 * against req.activeProject.data.members (set by resolveProjectParam above) instead of
 * the legacy singleton's members via getActiveProjectMembers(). Must run after both
 * requireAuth and resolveProjectParam. */
export function requireProjectRoleScoped(min: ProjectRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.isSystemAdmin) {
      next();
      return;
    }
    const members = req.activeProject?.data.members ?? [];
    const membership = members.find((m) => m.userId === req.user?.sub);
    if (!membership || PROJECT_ROLE_RANK[membership.role] < PROJECT_ROLE_RANK[min]) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
