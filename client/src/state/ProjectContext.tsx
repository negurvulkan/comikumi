import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type CurrentProject } from "../api/client";

interface ProjectContextValue {
  project: CurrentProject | null;
}

const ProjectContext = createContext<ProjectContextValue>({ project: null });

/** Fetches the currently active project once per navigation and makes it available
 * to every screen (header, volume/page path display, settings) via useProject() —
 * also owns the redirect-to-/project gate for when no project is open yet. */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState<CurrentProject | null>(null);

  useEffect(() => {
    api
      .getCurrentProject()
      .then((p) => {
        setProject(p);
        if (!p && pathname !== "/project") navigate("/project", { replace: true });
      })
      .catch(() => setProject(null));
  }, [pathname, navigate]);

  return <ProjectContext.Provider value={{ project }}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
