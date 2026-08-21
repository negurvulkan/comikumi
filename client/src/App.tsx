import { Link, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProjectProvider, useProject } from "./state/ProjectContext";
import { LanguageSwitcher } from "./editor/LanguageSwitcher";

function HeaderProjectLink() {
  const { project } = useProject();
  const { t } = useTranslation();
  if (!project) return null;
  return (
    <Link to="/project" style={{ fontSize: 12, color: "var(--text-muted)" }} title={t("appShell.switchProject")}>
      {t("appShell.projectLabel", { name: project.name })}
    </Link>
  );
}

export default function App() {
  const { t } = useTranslation();
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {!hasOwnMenuBar && <Link to="/settings">{t("appShell.settings")}</Link>}
            <LanguageSwitcher />
          </div>
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </ProjectProvider>
  );
}
