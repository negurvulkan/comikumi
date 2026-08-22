const TOKEN_KEY = "comikumi.authToken";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Thin fetch() wrapper — attaches `Authorization: Bearer <token>` when a token is
 * stored (see apiBase.ts's apiUrl(), which every URL passed here has already gone
 * through). On a 401 the token is cleared and the app hard-redirects to /login: simpler
 * than a global event bus for this one case, and correct either way since a 401 means
 * the whole session is no longer valid, not just this one request. */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && !input.includes("/api/auth/login") && !input.includes("/api/auth/setup")) {
    clearAuthToken();
    if (!location.hash.startsWith("#/login") && !location.hash.startsWith("#/setup")) {
      location.hash = "#/login";
    }
  }
  return res;
}

/** For the handful of routes the browser loads as a plain resource rather than via
 * fetch() — <img src>, FontFace(url(...)) — which can't attach a custom header. Appends
 * the token as a query param instead (see server/src/lib/auth.ts's requireAuth doc
 * comment for the trade-off this accepts). Returns the URL unchanged if there's no
 * token yet (the request will simply 401, same as any other unauthenticated call). */
export function authUrl(url: string): string {
  const token = getAuthToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}
