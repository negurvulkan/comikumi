import { Link, Outlet, useLocation, useNavigation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ProjectProvider, useProject } from "./state/ProjectContext";
import { SessionProvider, useSession } from "./state/SessionContext";
import { LanguageSwitcher } from "./editor/LanguageSwitcher";
import { EmailGateModal } from "./demo/EmailGateModal";

/** Every route is now its own lazy-loaded chunk (see main.tsx) — a slow connection or
 * cold cache means a visible gap between clicking a link and the new screen mounting.
 * `useNavigation().state === "loading"` covers exactly that window (route-module fetch
 * + any route loader), so a translator on a slow line sees feedback instead of a
 * silent blank pause. */
function RouteLoadingIndicator() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  if (navigation.state !== "loading") return null;
  return (
    <p className="hint" style={{ position: "fixed", top: 8, right: 12, zIndex: 1000, margin: 0 }}>
      {t("appShell.loadingRoute")}
    </p>
  );
}

function HeaderProjectLink() {
  const { project } = useProject();
  const { demoMode } = useSession();
  const { t } = useTranslation();
  // A demo container only ever has the one seeded project — the switcher link has
  // nowhere useful to go.
  if (!project || demoMode) return null;
  return (
    <Link to="/project" style={{ fontSize: 12, color: "var(--text-muted)" }} title={t("appShell.switchProject")}>
      {t("appShell.projectLabel", { name: project.name })}
    </Link>
  );
}

function HeaderSettingsLink() {
  const { project } = useProject();
  const { t } = useTranslation();
  if (!project) return null;
  return <Link to={`/p/${encodeURIComponent(project.id)}/settings`}>{t("appShell.settings")}</Link>;
}

function HeaderSessionInfo() {
  const { user, demoMode, logout } = useSession();
  const { t } = useTranslation();
  if (!user) return null;
  return (
    <span style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
      {t("appShell.loggedInAs", { username: user.username })}
      {/* Demo container shares one seeded account across visitors — per-account AI
          provider keys/ChatGPT logins have no business being configurable there. */}
      {!demoMode && <Link to="/account">{t("account.title")}</Link>}
      <button type="button" onClick={logout} title={t("appShell.logout")}>
        {t("appShell.logout")}
      </button>
    </span>
  );
}

export default function App() {
  // Screens with their own menu bar (volume list, page overview, editor, project
  // switcher) carry a "Projekt > Einstellungen" entry there instead — showing it
  // here too would be a redundant second entry point and break the cohesive look.
  const { pathname } = useLocation();
  const hasOwnMenuBar =
    pathname === "/project" || /^\/p\/[^/]+\/?$/.test(pathname) || /^\/p\/[^/]+\/volumes\//.test(pathname);

  return (
    <SessionProvider>
      <EmailGateModal />
      <ProjectProvider>
        <RouteLoadingIndicator />
        <div className="app-shell">
          <header className="app-header" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link to="/project" className="app-title">
              <img src="/brand/comikumi_logo_col_dark_h_tr.png" alt="ComiKumi" className="app-logo" />
            </Link>
            <HeaderProjectLink />
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              {!hasOwnMenuBar && <HeaderSettingsLink />}
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
