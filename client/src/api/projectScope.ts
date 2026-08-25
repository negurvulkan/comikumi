/**
 * Ambient "which project is this browser tab currently looking at" — a plain module
 * variable, not localStorage. Deliberately NOT persisted like the auth token
 * (authFetch.ts's getAuthToken()/setAuthToken()): the token is meant to be valid
 * device-wide, but the project id must be independent per tab, or two tabs could never
 * show two different projects at once — the whole point of the multi-project rollout
 * (see docs/FEATURES.md's Mehrbenutzerbetrieb section). Each tab loads its own JS
 * module instance, so a plain variable here already gives the right isolation for free.
 *
 * Set synchronously (not from an effect) by ProjectContext.tsx's ProjectScope layout
 * route, during render, so it's already correct by the time any child component's
 * effects fire their first api.* call — see that file's doc comment for why render-time
 * matters here.
 */
let currentProjectId: string | null = null;

export function getCurrentProjectId(): string | null {
  return currentProjectId;
}

export function setCurrentProjectId(id: string | null): void {
  currentProjectId = id;
}
