import { Link, Outlet, useLocation } from "react-router-dom";
import { ProjectProvider, useProject } from "./state/ProjectContext";

function HeaderProjectLink() {
  const { project } = useProject();
  if (!project) return null;
  return (
    <Link to="/project" style={{ fontSize: 12, color: "var(--text-muted)" }} title="Projekt wechseln">
      Projekt: {project.name}
    </Link>
  );
}

export default function App() {
  // Screens with their own menu bar (volume list, page overview, editor) carry
  // a "Projekt > Einstellungen" entry there instead — showing it here too would
  // be a redundant second entry point and break the cohesive look.
  const { pathname } = useLocation();
  const hasOwnMenuBar = pathname === "/" || pathname.startsWith("/volumes/");

  return (
    <ProjectProvider>
      <div className="app-shell">
        <header className="app-header" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/" className="app-title">
            <img src="/brand/comikumi_logo_col_dark_h_tr.png" alt="ComiKumi" className="app-logo" />
          </Link>
          <HeaderProjectLink />
          {!hasOwnMenuBar && (
            <Link to="/settings" style={{ marginLeft: "auto" }}>
              Einstellungen
            </Link>
          )}
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </ProjectProvider>
  );
}
