import { app, BrowserWindow } from "electron";
import path from "node:path";

// Packaged layout: server/dist + server/node_modules + client/dist are copied as
// plain extraResources (NOT inside app.asar) — see the root package.json's
// electron-builder config. This sidesteps needing asarUnpack for sharp's native
// binary entirely: node_modules living outside the asar archive just work like any
// normal on-disk install, resolved the same way Node always resolves them.
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "..", "server");
const clientDistDir = app.isPackaged ? path.join(process.resourcesPath, "client", "dist") : null;

const PORT = 3001;
const DEV_CLIENT_URL = "http://localhost:5173";

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
 * server here would just fight the first one over the same port. */
async function startEmbeddedServer(): Promise<void> {
  configureDataDir();
  const { createApp } = await import(path.join(serverDir, "dist", "app.js"));
  const expressApp = createApp(clientDistDir ? { staticDir: clientDistDir } : {});
  await new Promise<void>((resolve) => {
    expressApp.listen(PORT, () => resolve());
  });
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
  // "electron:dev" script) race to be ready — retry a few times instead of
  // leaving the window stuck on Chromium's "can't connect" error page.
  let attemptsLeft = app.isPackaged ? 1 : 20;
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
    if (app.isPackaged) await startEmbeddedServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
