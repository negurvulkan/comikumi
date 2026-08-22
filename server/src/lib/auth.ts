import type { NextFunction, Request, Response } from "express";
import { PROJECT_ROLE_RANK, type ProjectRole } from "../../../shared/src/users.js";
import { verifyToken, type AuthTokenPayload } from "./authStore.js";
import { getActiveProjectMembers } from "./projectStore.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth once a valid bearer token has been verified. */
      user?: AuthTokenPayload;
    }
  }
}

/** Baseline gate applied to every "/api/..." mount in app.ts (except /api/auth's public
 * setup/login routes) — reads `Authorization: Bearer <token>`, verifies it, and attaches
 * `req.user`. Responds directly (401) rather than throwing, same "answer immediately,
 * don't go through the error middleware" style as the existing 400/404 checks scattered
 * across routes/*.ts.
 *
 * Also accepts the token as a `?token=` query parameter, falling back to it only when
 * no Authorization header is present. This exists purely for the handful of routes the
 * browser loads as a plain resource rather than via fetch() — `<img src>` (page images/
 * thumbnails/project covers), FontFace(url(...)) and asset `/file/:name` routes — none
 * of which can attach a custom header. The client appends `?token=` only for those URLs
 * (see client/src/api/authFetch.ts's authUrl()); every JSON API call still goes through
 * the Authorization header. Known trade-off: a token used this way can end up in server
 * access logs/browser history, unlike a header — acceptable for this app's local/small-
 * team scope, not for a public-internet-facing deployment without further hardening. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization") ?? req.header("Authorization");
  const headerToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  const token = headerToken ?? queryToken;
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const payload = await verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.user = payload;
  next();
}

/** For server-wide actions (user management, project-switcher operations, filesystem
 * browsing) that don't belong to any single project's own members list. Must run after
 * requireAuth. */
export function requireSystemAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isSystemAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}

/** Resolves the caller's effective rank in the currently active project — a system
 * admin always resolves to "admin" (their bypass rank), otherwise their `members`
 * entry, or null if they're not a member at all. Used where a route needs to branch
 * on the exact role rather than just pass/fail a single minimum (e.g. layout.ts's
 * translator-can-only-edit-text diff guard). */
export async function resolveCallerProjectRole(req: Request): Promise<ProjectRole | null> {
  if (req.user?.isSystemAdmin) return "admin";
  const members = await getActiveProjectMembers();
  return members?.find((m) => m.userId === req.user?.sub)?.role ?? null;
}

/** Per-project role gate — must run after requireAuth. A system admin always passes
 * (bypass, see shared/src/users.ts's UserAccount.isSystemAdmin doc comment); otherwise
 * looks up the caller's entry in the currently active project's `members` list (see
 * shared/src/project.ts) and compares PROJECT_ROLE_RANK against `min`. */
export function requireProjectRole(min: ProjectRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.user?.isSystemAdmin) {
      next();
      return;
    }
    const members = await getActiveProjectMembers();
    const membership = members?.find((m) => m.userId === req.user?.sub);
    if (!membership || PROJECT_ROLE_RANK[membership.role] < PROJECT_ROLE_RANK[min]) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
