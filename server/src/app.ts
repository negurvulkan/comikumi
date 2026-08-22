import express, { type Express } from "express";
import cors from "cors";
import { volumesRouter } from "./routes/volumes.js";
import { pagesRouter } from "./routes/pages.js";
import { layoutRouter } from "./routes/layout.js";
import { exportRouter } from "./routes/export.js";
import { fontsRouter } from "./routes/fonts.js";
import { imagesRouter } from "./routes/images.js";
import { bubbleSvgsRouter } from "./routes/bubbleSvgs.js";
import { languagesRouter } from "./routes/languages.js";
import { charactersRouter } from "./routes/characters.js";
import { glossaryRouter } from "./routes/glossary.js";
import { presetsRouter } from "./routes/presets.js";
import { scriptRouter } from "./routes/script.js";
import { settingsRouter } from "./routes/settings.js";
import { projectRouter } from "./routes/project.js";
import { browseRouter } from "./routes/browse.js";
import { authRouter } from "./routes/auth.js";
import { requireAuth, requireProjectRole, requireSystemAdmin } from "./lib/auth.js";
import { readSettings, NoActiveProjectError } from "./lib/projectStore.js";
import { asyncHandler } from "./lib/asyncHandler.js";

/** Builds the Express app (routers + error middleware) without binding a port —
 * split out of index.ts so tests can mount it via supertest(createApp()) without
 * starting a real server. index.ts is the only caller that also calls .listen(). */
export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // Public — /login and /setup must work before the client has a token; /me and the
  // /users management routes gate themselves internally (see routes/auth.ts).
  app.use("/api/auth", authRouter);

  // Baseline for every project-scoped router: must be authenticated AND at least a
  // "viewer" member of the currently active project (system admins bypass, see
  // requireProjectRole()). Individual mutating routes inside each router file layer a
  // stricter minimum role on top (e.g. characters.ts's POST/PUT/DELETE require
  // "letterer") — see the plan's route→role matrix.
  const requireViewer = requireProjectRole("viewer");
  app.use("/api/volumes", requireAuth, requireViewer, volumesRouter);
  app.use("/api/volumes", requireAuth, requireViewer, pagesRouter);
  app.use("/api/volumes", requireAuth, requireViewer, layoutRouter);
  app.use("/api/volumes", requireAuth, requireViewer, exportRouter);
  app.use("/api/volumes", requireAuth, requireViewer, scriptRouter);
  app.use("/api/fonts", requireAuth, requireViewer, fontsRouter);
  app.use("/api/images", requireAuth, requireViewer, imagesRouter);
  app.use("/api/bubble-svgs", requireAuth, requireViewer, bubbleSvgsRouter);
  app.use("/api/languages", requireAuth, requireViewer, languagesRouter);
  app.use("/api/characters", requireAuth, requireViewer, charactersRouter);
  app.use("/api/glossary", requireAuth, requireViewer, glossaryRouter);
  app.use("/api/presets", requireAuth, requireViewer, presetsRouter);
  app.use("/api/settings", requireAuth, requireViewer, settingsRouter);
  // Project-switcher-level, not project-content — its own routes self-gate per-route
  // (requireSystemAdmin for most, a bespoke membership check for /open), see routes/project.ts.
  app.use("/api/project", requireAuth, projectRouter);
  // Server-wide filesystem browsing — system-admin only, not tied to any one project.
  app.use("/api/browse", requireAuth, requireSystemAdmin, browseRouter);

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      try {
        const settings = await readSettings();
        res.json({ ok: true, scanRoot: settings.scanRoot });
      } catch (err) {
        if (err instanceof NoActiveProjectError) {
          res.json({ ok: true, scanRoot: null });
          return;
        }
        throw err;
      }
    })
  );

  // Catches everything asyncHandler forwards via next(err) — every route handler
  // in this app is wrapped in asyncHandler, so a rejected promise/thrown error
  // always lands here instead of hanging the request (Express 4 does not do
  // this automatically for async handlers). Must be registered last, and must
  // keep all four parameters — that arity is how Express recognizes error
  // middleware.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof NoActiveProjectError) {
      res.status(409).json({ error: "no_active_project" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
