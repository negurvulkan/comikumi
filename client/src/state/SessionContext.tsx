import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { PublicUser } from "../../../shared/src/users";
import { getAuthToken, clearAuthToken } from "../api/authFetch";

interface SessionContextValue {
  user: PublicUser | null;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue>({ user: null, logout: () => {} });

const PUBLIC_ROUTES = ["/login", "/setup"];

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

  useEffect(() => {
    if (!getAuthToken()) {
      api
        .getSetupStatus()
        .then(({ hasAnyUsers }) => {
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

  return <SessionContext.Provider value={{ user, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
