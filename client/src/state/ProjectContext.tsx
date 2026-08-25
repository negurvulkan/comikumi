import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type CurrentProject } from "../api/client";
import { setCurrentProjectId } from "../api/projectScope";

interface ProjectContextValue {
  project: CurrentProject | null;
}

const ProjectContext = createContext<ProjectContextValue>({ project: null });

/** Pulls the `:projectId` segment out of a `/p/:projectId/...` pathname, or null for
 * any other route (login, setup, project switcher, admin) — parsed from the URL
 * instead of via useParams() because this provider wraps the whole app shell
 * (App.tsx's header needs project data too, see HeaderProjectLink/the settings link),
 * not just the routed content under the matching route's own Outlet. */
function projectIdFromPathname(pathname: string): string | null {
  return pathname.match(/^\/p\/([^/]+)/)?.[1] ?? null;
}

/** Wraps the whole app shell (client/src/App.tsx) — sets the ambient project id
 * (client/src/api/projectScope.ts) synchronously during render, before any child's
 * effects can fire an api.* call, so there's no race between navigating to a new
 * project and the next request going out scoped correctly. Also fetches the project's
 * data (name, role, ...) and makes it available via useProject(), and owns the
 * redirect-to-/project gate for an unknown/inaccessible id (bad bookmark, revoked
 * membership, typo'd URL). */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const projectId = projectIdFromPathname(pathname);
  setCurrentProjectId(projectId);

  const [project, setProject] = useState<CurrentProject | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    api
      .getProjectInfo(projectId)
      .then((p) => setProject(p))
      .catch(() => {
        setProject(null);
        navigate("/project", { replace: true });
      });
  }, [projectId, navigate]);

  return <ProjectContext.Provider value={{ project }}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
