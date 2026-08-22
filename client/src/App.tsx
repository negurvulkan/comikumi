import { Link, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProjectProvider, useProject } from "./state/ProjectContext";
import { SessionProvider, useSession } from "./state/SessionContext";
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

function HeaderSessionInfo() {
  const { user, logout } = useSession();
  const { t } = useTranslation();
  if (!user) return null;
  return (
    <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
      {t("appShell.loggedInAs", { username: user.username })}
      <button type="button" onClick={logout} title={t("appShell.logout")}>
        {t("appShell.logout")}
      </button>
    </span>
  );
}

export default function App() {
  const { t } = useTranslation();
  // Screens with their own menu bar (volume list, page overview, editor, project
  // switcher) carry a "Projekt > Einstellungen" entry there instead — showing it
  // here too would be a redundant second entry point and break the cohesive look.
  const { pathname } = useLocation();
  const hasOwnMenuBar = pathname === "/" || pathname === "/project" || pathname.startsWith("/volumes/");

  return (
    <SessionProvider>
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
              <HeaderSessionInfo />
            </div>
          </header>
          <main className="app-main">
            <Outlet />
          </main>
        </div>
      </ProjectProvider>
    </SessionProvider>
  );
}
