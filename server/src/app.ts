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
import { settingsRouter } from "./routes/settings.js";
import { projectRouter } from "./routes/project.js";
import { browseRouter } from "./routes/browse.js";
import { readSettings, NoActiveProjectError } from "./lib/projectStore.js";
import { asyncHandler } from "./lib/asyncHandler.js";

/** Builds the Express app (routers + error middleware) without binding a port —
 * split out of index.ts so tests can mount it via supertest(createApp()) without
 * starting a real server. index.ts is the only caller that also calls .listen(). */
export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.use("/api/volumes", volumesRouter);
  app.use("/api/volumes", pagesRouter);
  app.use("/api/volumes", layoutRouter);
  app.use("/api/volumes", exportRouter);
  app.use("/api/fonts", fontsRouter);
  app.use("/api/images", imagesRouter);
  app.use("/api/bubble-svgs", bubbleSvgsRouter);
  app.use("/api/languages", languagesRouter);
  app.use("/api/characters", charactersRouter);
  app.use("/api/glossary", glossaryRouter);
  app.use("/api/presets", presetsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/project", projectRouter);
  app.use("/api/browse", browseRouter);

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
