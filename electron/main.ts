import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Packaged layout: server/dist + server/node_modules + client/dist are copied as
// plain extraResources (NOT inside app.asar) — see the root package.json's
// electron-builder config. This sidesteps needing asarUnpack for sharp's native
// binary entirely: node_modules living outside the asar archive just work like any
// normal on-disk install, resolved the same way Node always resolves them.
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "..", "server");
const clientDistDir = app.isPackaged ? path.join(process.resourcesPath, "client", "dist") : null;

const PORT = 3001;
const DEV_CLIENT_URL = "http://localhost:5173";

// Same "GUI apps have no visible console" reasoning as the startEmbeddedServer()
// try/catch below, but for errors that surface AFTER startup resolves — e.g. inside
// app.listen()'s own callback or the scheduled trash-purge interval in
// server/src/index.ts, which this file's `await import(...)` can't observe (the
// import settles once index.ts's synchronous top-level code finishes, not once its
// async callbacks fire). Without this, such an error would just vanish.
process.on("uncaughtException", (err) => {
  dialog.showErrorBox("Unerwarteter Fehler in ComiKumi", err.stack ?? err.message);
});
process.on("unhandledRejection", (reason) => {
  dialog.showErrorBox("Unerwarteter Fehler in ComiKumi", reason instanceof Error ? (reason.stack ?? reason.message) : String(reason));
});

/** Points server/src/lib/paths.ts's DATA_DIR (fonts/images/bubble-svgs/thumbnails
 * cache, app-state.json) at a real writable per-user directory instead of its
 * default (next to the server package on disk — not writable once installed under
 * Program Files). Must be set before the server module is imported: paths.ts reads
 * this env var once, at module-evaluation time. */
function configureDataDir(): void {
  process.env.LETTERING_DATA_DIR = path.join(app.getPath("userData"), "data");
}

/** Only used in the packaged app — in dev, `npm run dev` already runs the real
 * server (tsx watch, port 3001) and Vite client separately; embedding a second
 * server here would just fight the first one over the same port.
 *
 * Imports server/src/index.ts's own build output (self-starting: it calls
 * app.listen() and schedules trash-purge itself, see index.ts) rather than
 * importing app.ts's createApp() and driving it by hand — the same env-var
 * contract (`PORT`, `CLIENT_DIST_DIR`, `LETTERING_DATA_DIR`) the Docker demo
 * image already uses (see Dockerfile), so the desktop build and the demo
 * container share one server boot path instead of Electron maintaining a
 * second, divergent one. `DEMO_MODE` is deliberately left unset — no demo
 * seeding/rate-limited demo router in the desktop build. */
async function startEmbeddedServer(): Promise<void> {
  configureDataDir();
  process.env.PORT = String(PORT);
  if (clientDistDir) process.env.CLIENT_DIST_DIR = clientDistDir;
  const entry = path.join(serverDir, "dist", "server", "src", "index.js");
  // A real dynamic import() — not require(), which fails with ERR_REQUIRE_ASYNC_MODULE
  // against an ESM module that has top-level await, exactly what server/src/index.ts
  // has (see electron/tsconfig.json's "module": "NodeNext", required for `tsc` to
  // preserve this as a genuine import() instead of downleveling it to require()) —
  // still needs a proper URL on Windows: a bare "C:\..." path isn't a URL scheme
  // import() accepts, only "file://..." is.
  await import(pathToFileURL(entry).href);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Loaded via http://, never file:// — the client's /api/* fetches are
  // root-relative and need a same-origin HTTP server to catch them (see
  // client/src/api/client.ts).
  const url = app.isPackaged ? `http://localhost:${PORT}/` : DEV_CLIENT_URL;

  // In dev, Electron and Vite's dev server (started together via the
  // "electron:dev" script) race to be ready. In packaged mode, `startEmbeddedServer()`'s
  // `await import(...)` only guarantees index.ts's synchronous setup ran, not that
  // `app.listen()`'s callback has actually fired (index.ts has no "ready" signal to
  // await) — so this can still race the port bind on a slow machine. Retry a few
  // times either way instead of leaving the window stuck on Chromium's "can't
  // connect" error page.
  let attemptsLeft = app.isPackaged ? 10 : 20;
  const tryLoad = () => {
    win.loadURL(url).catch(() => {
      attemptsLeft -= 1;
      if (attemptsLeft > 0) setTimeout(tryLoad, 500);
    });
  };
  tryLoad();
}

// Single-instance lock: the packaged app binds a fixed local port (3001) and
// writes to a single per-user data directory — a second instance would either
// fail to bind the port or race the first instance's file writes. Simplest
// correct fix: only one instance ever runs; a second launch just focuses the first.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    // A GUI-subsystem Windows executable has no attached console — Node's own
    // console.log/console.error inside the embedded server (and any uncaught
    // startup error here) go nowhere visible, silently leaving the window on
    // Chromium's default "can't connect" error page with zero diagnostic
    // information. A native dialog is the one channel guaranteed visible
    // regardless of how the app was launched.
    if (app.isPackaged) {
      try {
        await startEmbeddedServer();
      } catch (err) {
        dialog.showErrorBox("ComiKumi konnte nicht gestartet werden", err instanceof Error ? (err.stack ?? err.message) : String(err));
        app.quit();
        return;
      }
    }
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
