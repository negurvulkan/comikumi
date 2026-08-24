import express, { type Express } from "express";
import cors from "cors";
import { config } from "./config.js";
import { sessionMiddleware } from "./sessionMiddleware.js";
import { proxy } from "./proxy.js";

export function createApp(): Express {
  const app = express();

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
