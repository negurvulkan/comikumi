import type { NextFunction, Request, Response } from "express";
import { parse, serialize } from "cookie";
import { config } from "./config.js";
import { getSession, touch, getOrCreateSessionForIp, SessionCapacityError } from "./sessionManager.js";

declare global {
  namespace Express {
    interface Request {
      /** Set once a session has been resolved/created — the proxy middleware's
       * router reads this to pick a target, see proxy.ts. */
      demoTarget?: string;
    }
  }
}

/** Resolves the visitor's session-routing cookie to a running container, creating one
 * (and issuing the cookie) on first contact. Must run after CORS/OPTIONS handling —
 * preflight requests never carry cookies, so treating one as "no session" here would
 * spin up a wasted container on every preflight. */
export async function sessionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookies = parse(req.headers.cookie ?? "");
  const existingId = cookies[config.sessionCookieName];
  let session = getSession(existingId);

  if (session) {
    touch(session);
  } else {
    try {
      // Coalesced per-IP — a single page load fires several parallel API calls before
      // any of them can receive this response's Set-Cookie, so without this every one
      // of those would otherwise start (and be billed for) its own container.
      session = await getOrCreateSessionForIp(req.ip ?? "unknown");
    } catch (err) {
      if (err instanceof SessionCapacityError) {
        res.status(503).json({ error: "demo_at_capacity" });
        return;
      }
      next(err);
      return;
    }
    // Same-site (demo-client/demo-server share a registrable domain), so Lax already
    // allows this cookie on cross-origin fetch/img/font subresource requests — no
    // need for SameSite=None. Secure requires HTTPS in front of this (Plesk/Let's
    // Encrypt terminates TLS before the broker, see the deployment runbook).
    res.setHeader(
      "Set-Cookie",
      serialize(config.sessionCookieName, session.id, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: config.sessionIdleTimeoutMs / 1000,
      })
    );
  }

  req.demoTarget = `http://127.0.0.1:${session.hostPort}`;
  next();
}
