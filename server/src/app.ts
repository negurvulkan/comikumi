import express, { type Express } from "express";
import path from "node:path";
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
import { entitiesRouter } from "./routes/entities.js";
import { entityImagesRouter } from "./routes/entityImages.js";
import { glossaryRouter } from "./routes/glossary.js";
import { presetsRouter } from "./routes/presets.js";
import { scriptRouter } from "./routes/script.js";
import { commentsRouter } from "./routes/comments.js";
import { settingsRouter } from "./routes/settings.js";
import { projectRouter } from "./routes/project.js";
import { browseRouter } from "./routes/browse.js";
import { authRouter } from "./routes/auth.js";
import { aiRouter } from "./routes/ai.js";
import { demoRouter, demoRateLimiter } from "./routes/demo.js";
import { requireAuth, requireProjectRole, requireSystemAdmin } from "./lib/auth.js";
import { resolveProjectParam, requireProjectRoleScoped } from "./lib/projectContext.js";
import { readSettings, NoActiveProjectError, ProjectNotFoundError } from "./lib/projectStore.js";
import { asyncHandler } from "./lib/asyncHandler.js";
import { DEMO_MODE } from "./lib/demoMode.js";

export interface CreateAppOptions {
  /** Absolute path to the built client SPA (client/dist) — when set, the app serves
   * it as static files with an index.html fallback for any non-/api route, so a
   * single process can be both API and web server (used by the demo Docker image and
   * Electron's packaged build). Omit to run API-only, e.g. behind Vite's dev proxy. */
  staticDir?: string | null;
}

/** Builds the Express app (routers + error middleware) without binding a port —
 * split out of index.ts so tests can mount it via supertest(createApp()) without
 * starting a real server. index.ts is the only caller that also calls .listen(). */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  // origin: true reflects the request's Origin header instead of "*" — required
  // because authFetch.ts sends credentials: "include", and browsers reject a
  // wildcard Access-Control-Allow-Origin on credentialed requests.
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "5mb" }));

  // Public — /login and /setup must work before the client has a token; /me and the
  // /users management routes gate themselves internally (see routes/auth.ts).
  app.use("/api/auth", authRouter);
  // Only mounted at all when DEMO_MODE is on — unmounted (not just gated) in every
  // other deployment, so the "hand out a token with no credentials" endpoint doesn't
  // exist as an attack surface outside a demo container. Rate-limited since both of
  // its routes are, by design, reachable with no auth at all.
  if (DEMO_MODE) app.use("/api/demo", demoRateLimiter, demoRouter);

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
  // No stricter per-route role needed inside commentsRouter itself — every project
  // member (viewer and up) is allowed to read/write comments (see comments.ts's own
  // doc comment); the router-mount baseline above is the only gate required.
  app.use("/api/volumes", requireAuth, requireViewer, commentsRouter);
  app.use("/api/fonts", requireAuth, requireViewer, fontsRouter);
  app.use("/api/images", requireAuth, requireViewer, imagesRouter);
  app.use("/api/bubble-svgs", requireAuth, requireViewer, bubbleSvgsRouter);
  app.use("/api/languages", requireAuth, requireViewer, languagesRouter);
  app.use("/api/characters", requireAuth, requireViewer, charactersRouter);
  app.use("/api/entities", requireAuth, requireViewer, entitiesRouter);
  app.use("/api/entity-images", requireAuth, requireViewer, entityImagesRouter);
  app.use("/api/glossary", requireAuth, requireViewer, glossaryRouter);
  app.use("/api/presets", requireAuth, requireViewer, presetsRouter);
  app.use("/api/settings", requireAuth, requireViewer, settingsRouter);

  // Project-scoped routes (see docs/FEATURES.md's Mehrbenutzerbetrieb section) — same
  // router files as the legacy `/api/...` mounts above (their handlers thread
  // `req.activeProject` through to projectStore.ts's readX/writeX functions when it's
  // set), reachable in parallel under an explicit `:projectId` instead of the one
  // implicit server-wide active project. Every content router is now migrated (phase 2);
  // only the project-switcher (`/api/project`) and server-wide filesystem browsing stay
  // singleton-only — they operate on project *files*, not "the currently open one".
  const requireViewerScoped = requireProjectRoleScoped("viewer");
  app.use("/api/p/:projectId/volumes", requireAuth, resolveProjectParam, requireViewerScoped, volumesRouter);
  app.use("/api/p/:projectId/volumes", requireAuth, resolveProjectParam, requireViewerScoped, pagesRouter);
  app.use("/api/p/:projectId/volumes", requireAuth, resolveProjectParam, requireViewerScoped, layoutRouter);
  app.use("/api/p/:projectId/volumes", requireAuth, resolveProjectParam, requireViewerScoped, exportRouter);
  app.use("/api/p/:projectId/volumes", requireAuth, resolveProjectParam, requireViewerScoped, scriptRouter);
  app.use("/api/p/:projectId/volumes", requireAuth, resolveProjectParam, requireViewerScoped, commentsRouter);
  app.use("/api/p/:projectId/fonts", requireAuth, resolveProjectParam, requireViewerScoped, fontsRouter);
  app.use("/api/p/:projectId/images", requireAuth, resolveProjectParam, requireViewerScoped, imagesRouter);
  app.use("/api/p/:projectId/bubble-svgs", requireAuth, resolveProjectParam, requireViewerScoped, bubbleSvgsRouter);
  app.use("/api/p/:projectId/languages", requireAuth, resolveProjectParam, requireViewerScoped, languagesRouter);
  app.use("/api/p/:projectId/characters", requireAuth, resolveProjectParam, requireViewerScoped, charactersRouter);
  app.use("/api/p/:projectId/entities", requireAuth, resolveProjectParam, requireViewerScoped, entitiesRouter);
  app.use("/api/p/:projectId/entity-images", requireAuth, resolveProjectParam, requireViewerScoped, entityImagesRouter);
  app.use("/api/p/:projectId/glossary", requireAuth, resolveProjectParam, requireViewerScoped, glossaryRouter);
  app.use("/api/p/:projectId/presets", requireAuth, resolveProjectParam, requireViewerScoped, presetsRouter);
  app.use("/api/p/:projectId/settings", requireAuth, resolveProjectParam, requireViewerScoped, settingsRouter);

  // Bootstrap info for a project-scoped client session (client/src/state/
  // ProjectContext.tsx) — the scoped equivalent of GET /api/project/current below, but
  // resolved from an explicit :projectId instead of the legacy singleton. Needed
  // whenever the client (re-)enters a `/p/:projectId/...` URL without already knowing
  // the project's data (bookmark, reload) — right after /project/open or /project/new
  // the response already carries the same shape, so this is only the *first* load.
  app.get(
    "/api/p/:projectId",
    requireAuth,
    resolveProjectParam,
    requireViewerScoped,
    asyncHandler(async (req, res) => {
      const project = req.activeProject!;
      let myRole: string = "none";
      if (req.user?.isSystemAdmin) {
        myRole = "system-admin";
      } else {
        myRole = project.data.members.find((m) => m.userId === req.user?.sub)?.role ?? "none";
      }
      res.json({
        filePath: project.filePath,
        id: project.id,
        name: project.data.name,
        readingDirection: project.data.readingDirection,
        coverImagePath: project.data.coverImagePath,
        myRole,
      });
    })
  );

  // Per-account, not project-scoped at all — same gate as /api/auth/me (just
  // requireAuth, no project role). Deliberately separate from the /api/auth mount so
  // it reads as its own subsystem (provider abstraction, see server/src/lib/ai/).
  app.use("/api/ai", requireAuth, aiRouter);

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

  if (options.staticDir) {
    const staticDir = options.staticDir;
    app.use(express.static(staticDir));
    // SPA fallback: anything not already matched by an /api/* route or a static file
    // gets index.html so client-side (hash) routing works on a hard refresh/direct
    // link. The negative lookahead keeps a typo'd/removed API route 404ing normally
    // instead of silently serving HTML.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

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
    // Defense-in-depth — resolveProjectParam already catches this itself and 404s
    // directly, this only matters if some other code path ever throws it uncaught.
    if (err instanceof ProjectNotFoundError) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
