import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { PublicUser } from "../../../shared/src/users";
import { getAuthToken, setAuthToken, clearAuthToken } from "../api/authFetch";

interface SessionContextValue {
  user: PublicUser | null;
  /** True once the server has confirmed it's running as the public online demo (see
   * server/src/lib/demoMode.ts) — lets other components hide affordances that don't
   * make sense for a single-project, no-real-account demo container (project
   * switcher, "logged in as" account management, …). */
  demoMode: boolean;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue>({ user: null, demoMode: false, logout: () => {} });

const PUBLIC_ROUTES = ["/login", "/setup"];

/** Persisted so a page reload with an existing (demo) token already knows demoMode
 * before any request resolves, without adding an extra setup-status round-trip to
 * every navigation in the normal (non-demo) auth flow below. */
const DEMO_MODE_KEY = "comikumi.demoMode";

function getStoredDemoMode(): boolean {
  return localStorage.getItem(DEMO_MODE_KEY) === "true";
}

/** Same shape as ProjectContext.tsx (fetch once per navigation, redirect via effect
 * when the expected state isn't there) — gates every other screen behind having a
 * valid session, redirecting to /setup (no accounts exist yet at all) or /login
 * (accounts exist, but this browser has no/an invalid token) otherwise. Must wrap
 * ProjectProvider from the outside (see main.tsx) — a project can't meaningfully load
 * before we know who's asking. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [demoMode, setDemoMode] = useState(getStoredDemoMode);

  useEffect(() => {
    if (!getAuthToken()) {
      api
        .getSetupStatus()
        .then(({ hasAnyUsers, demoMode: isDemo }) => {
          setDemoMode(isDemo);
          localStorage.setItem(DEMO_MODE_KEY, String(isDemo));
          if (isDemo) {
            // No login/setup screen in demo mode — auto-issue a token for the single
            // seeded demo account instead (see server/src/routes/demo.ts).
            return api.getDemoToken().then(({ token, user: demoUser }) => {
              setAuthToken(token);
              setUser(demoUser);
              if (PUBLIC_ROUTES.includes(pathname)) navigate("/", { replace: true });
            });
          }
          setUser(null);
          if (!PUBLIC_ROUTES.includes(pathname)) navigate(hasAnyUsers ? "/login" : "/setup", { replace: true });
        })
        .catch(() => setUser(null));
      return;
    }
    api
      .getMe()
      .then((u) => {
        setUser(u);
        if (PUBLIC_ROUTES.includes(pathname)) navigate("/", { replace: true });
      })
      .catch(() => {
        clearAuthToken();
        setUser(null);
        if (!PUBLIC_ROUTES.includes(pathname)) navigate("/login", { replace: true });
      });
  }, [pathname, navigate]);

  function logout() {
    clearAuthToken();
    setUser(null);
    navigate("/login", { replace: true });
  }

  return <SessionContext.Provider value={{ user, demoMode, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
