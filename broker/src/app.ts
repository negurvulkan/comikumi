import express, { type Express } from "express";
import cors from "cors";
import { config } from "./config.js";
import { sessionMiddleware } from "./sessionMiddleware.js";
import { proxy } from "./proxy.js";

export function createApp(): Express {
  const app = express();

  // The broker only ever accepts connections from Plesk's nginx on 127.0.0.1 (see
  // index.ts's loopback-only listen) — trusting that one hop's X-Forwarded-For lets
  // req.ip resolve to the real visitor IP instead of nginx's own loopback address.
  // Needed for getOrCreateSessionForIp()'s per-visitor request coalescing to actually
  // distinguish visitors instead of treating every request as coming from 127.0.0.1.
  app.set("trust proxy", "loopback");

  // Exact origin + credentials (never a wildcard — required for the session cookie to
  // be usable at all) — the `cors` package answers OPTIONS preflight itself and never
  // calls next(), so preflights never reach sessionMiddleware/Docker below.
  app.use(cors({ origin: config.clientOrigin, credentials: true }));

  // Infra monitoring — deliberately bypasses session resolution entirely, so a health
  // check never spins up a container.
  app.get("/broker/healthz", (_req, res) => res.json({ ok: true }));

  // No body-parser anywhere on this path — it would buffer/consume the request stream
  // and break streaming of large multipart uploads through the proxy below.
  app.use(sessionMiddleware);
  app.use(proxy);

  return app;
}
