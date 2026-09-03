import { app, BrowserWindow, dialog, ipcMain, shell, Menu, type MenuItemConstructorOptions } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Packaged layout: server/dist + server/node_modules + client/dist are copied as
// plain extraResources (NOT inside app.asar) — see the root package.json's
// electron-builder config. This sidesteps needing asarUnpack for sharp's native
// binary entirely: node_modules living outside the asar archive just work like any
// normal on-disk install, resolved the same way Node always resolves them.
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "..", "server");
const clientDistDir = app.isPackaged ? path.join(process.resourcesPath, "client", "dist") : null;

const DEFAULT_PORT = 3001;
const DEV_CLIENT_URL = "http://localhost:5173";
const iconPath = path.join(__dirname, "..", "build", "icon.png");

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

/**
 * First-run setup: whether this install runs its OWN embedded server ("local" — where
 * server/src/lib/paths.ts's DATA_DIR lives, and which local port it binds) or just
 * points the window at an already-running ComiKumi server elsewhere ("remote" — a
 * plain URL, nothing started locally at all). Asked once via the setup wizard (see
 * runSetupWizard()) and persisted here, but — unlike the first version of this file —
 * revisitable later via the "Server wechseln…" menu item (see buildAppMenu()).
 *
 * Both `local` and `remoteUrl` are kept in the saved config even when only one is
 * currently active, so switching modes back and forth doesn't lose whichever one isn't
 * selected right now. `local.dataDir` CAN be changed via the menu same as everything
 * else here — deliberately not hard-blocked — but see setup.html's inline warning: it
 * holds live account/auth-secret state (paths.ts), so changing it doesn't move
 * anything, it just points at a different (possibly empty) location.
 */
type ElectronConfig =
  | { mode: "local"; local: { dataDir: string; port: number } }
  | { mode: "remote"; remoteUrl: string; local?: { dataDir: string; port: number } };

function configFilePath(): string {
  return path.join(app.getPath("userData"), "comikumi-config.json");
}

function isValidLocal(value: unknown): value is { dataDir: string; port: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.dataDir === "string" && v.dataDir.trim().length > 0 && typeof v.port === "number" && Number.isInteger(v.port) && v.port > 0 && v.port < 65536;
}

function isValidRemoteUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidConfig(value: unknown): value is ElectronConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.mode === "local") return isValidLocal(v.local);
  if (v.mode === "remote") return isValidRemoteUrl(v.remoteUrl) && (v.local === undefined || isValidLocal(v.local));
  return false;
}

async function loadConfig(): Promise<ElectronConfig | null> {
  try {
    const raw = await fs.readFile(configFilePath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isValidConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveConfig(config: ElectronConfig): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(configFilePath(), JSON.stringify(config, null, 2), "utf-8");
}

/** Only used for `mode: "local"` in a packaged app — in dev, `npm run dev` already
 * runs the real server (tsx watch, port 3001) and Vite client separately; embedding a
 * second server here would just fight the first one over the same port. Never called
 * at all for `mode: "remote"` — the window just loads that server's own URL, same as
 * pointing a normal browser at it (see createWindow()).
 *
 * Imports server/src/index.ts's own build output (self-starting: it calls
 * app.listen() and schedules trash-purge itself, see index.ts) rather than
 * importing app.ts's createApp() and driving it by hand — the same env-var
 * contract (`PORT`, `CLIENT_DIST_DIR`, `LETTERING_DATA_DIR`) the Docker demo
 * image already uses (see Dockerfile), so the desktop build and the demo
 * container share one server boot path instead of Electron maintaining a
 * second, divergent one. `DEMO_MODE` is deliberately left unset — no demo
 * seeding/rate-limited demo router in the desktop build. */
async function startEmbeddedServer(local: { dataDir: string; port: number }): Promise<void> {
  process.env.LETTERING_DATA_DIR = local.dataDir;
  process.env.PORT = String(local.port);
  if (clientDistDir) process.env.CLIENT_DIST_DIR = clientDistDir;
  // A real dynamic import() — not require(), which fails with ERR_REQUIRE_ASYNC_MODULE
  // against an ESM module that has top-level await, exactly what server/src/index.ts
  // has (see electron/tsconfig.json's "module": "NodeNext", required for `tsc` to
  // preserve this as a genuine import() instead of downleveling it to require()) —
  // still needs a proper URL on Windows: a bare "C:\..." path isn't a URL scheme
  // import() accepts, only "file://..." is.
  const entry = path.join(serverDir, "dist", "server", "src", "index.js");
  await import(pathToFileURL(entry).href);
}

/** The app's own client bundle is served same-origin by whichever server is active —
 * the embedded local one, or a remote ComiKumi server's own CLIENT_DIST_DIR (see the
 * root README's "Running client and server on separate hosts" section: the client
 * already only ever makes same-origin /api/* calls, so pointing this window at a
 * remote server's URL needs zero client-side changes, exactly like opening that URL
 * in a normal browser would). */
function targetUrl(config: ElectronConfig): string {
  if (config.mode === "remote") return config.remoteUrl;
  return `http://localhost:${config.local.port}/`;
}

function createWindow(url: string): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, Electron and Vite's dev server (started together via the
  // "electron:dev" script) race to be ready. In packaged local mode,
  // `startEmbeddedServer()`'s `await import(...)` only guarantees index.ts's
  // synchronous setup ran, not that `app.listen()`'s callback has actually fired
  // (index.ts has no "ready" signal to await) — so this can still race the port bind
  // on a slow machine. In remote mode this instead retries a genuinely unreachable
  // server, which is the right behavior for "briefly offline at launch" too. Retry a
  // few times either way instead of leaving the window stuck on Chromium's "can't
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

// --- IPC ---

// Renderer-triggered shell.openExternal — used by AccountSettings.tsx's Codex "Sign in
// with ChatGPT" link (see client's openExternal() there) so it opens in the user's real
// OS browser instead of a confusing second window inside this app's own embedded
// Chromium. Scheme-checked even though the caller is our own trusted renderer code —
// contextIsolation makes the renderer a real trust boundary, so this is the same
// "validate at the boundary" bar every other IPC handler here holds to, not
// defense-in-depth theater. Registered unconditionally (works from the main app window
// too, local or remote, not just setup.html).
ipcMain.on("open-external", (_event, url: unknown) => {
  if (typeof url === "string" && /^https:\/\//.test(url)) shell.openExternal(url);
});

// setup.html's IPC surface — see runSetupWizard() below for the window(s) this serves.
ipcMain.handle("setup:get-prefill", async () => ({
  defaultLocalDir: path.join(app.getPath("userData"), "data"),
  current: await loadConfig(),
}));
ipcMain.handle("setup:pick-directory", async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const options: Electron.OpenDialogOptions = { properties: ["openDirectory", "createDirectory"] };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

let resolveSetupSubmit: ((config: ElectronConfig) => void) | null = null;
ipcMain.handle("setup:submit", (_event, config: unknown) => {
  if (!isValidConfig(config)) return false;
  resolveSetupSubmit?.(config);
  return true;
});

/** Shows the setup window (local-vs-remote + local dir/port + remote URL, see
 * setup.html) and resolves once the user submits it — `null` if they close the window
 * without submitting. Reused for both first-run (no `current`, caller quits on `null`
 * since that's a step the user explicitly saw and dismissed) and the "Server
 * wechseln…" menu item (`current` prefills the form, caller just leaves the running
 * app alone on `null` since there's nothing to undo yet). */
function runSetupWizard(): Promise<ElectronConfig | null> {
  return new Promise((resolve) => {
    const setupWin = new BrowserWindow({
      width: 560,
      height: 620,
      resizable: false,
      icon: iconPath,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    let settled = false;
    function finish(config: ElectronConfig | null) {
      if (settled) return;
      settled = true;
      resolveSetupSubmit = null;
      resolve(config);
      if (!setupWin.isDestroyed()) setupWin.close();
    }

    resolveSetupSubmit = (config) => finish(config);
    setupWin.on("closed", () => finish(null));
    setupWin.loadFile(path.join(__dirname, "..", "setup.html"));
  });
}

/** "Server wechseln…" menu action — reopens the setup wizard prefilled with the
 * current config, saves whatever the user submits, then offers to relaunch (every
 * setting here — which server to talk to, or the embedded server's port — only takes
 * effect on a fresh app.whenReady() pass). Declining to relaunch leaves the running
 * session exactly as it was; the new config only applies next launch. */
async function changeServer(): Promise<void> {
  const next = await runSetupWizard();
  if (!next) return;
  await saveConfig(next);
  const { response } = await dialog.showMessageBox({
    type: "info",
    message: "ComiKumi jetzt neu starten, damit die Änderung wirkt?",
    buttons: ["Jetzt neu starten", "Später"],
    defaultId: 0,
  });
  if (response === 0) {
    app.relaunch();
    app.exit();
  }
}

function buildAppMenu(): Menu {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [{ role: "about" }, { type: "separator" }, { label: "Server wechseln…", click: () => void changeServer() }, { type: "separator" }, { role: "quit" }],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: "Datei",
      submenu: [
        ...(!isMac ? ([{ label: "Server wechseln…", click: () => void changeServer() }, { type: "separator" }] as MenuItemConstructorOptions[]) : []),
        { role: isMac ? "close" : "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}

// Single-instance lock: the packaged app binds a fixed local port (default 3001) and
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
    Menu.setApplicationMenu(buildAppMenu());

    let url = DEV_CLIENT_URL;
    if (app.isPackaged) {
      let config = await loadConfig();
      if (!config) {
        config = await runSetupWizard();
        if (!config) {
          app.quit();
          return;
        }
        await saveConfig(config);
      }
      url = targetUrl(config);
      if (config.mode === "local") {
        // A GUI-subsystem Windows executable has no attached console — Node's own
        // console.log/console.error inside the embedded server (and any uncaught
        // startup error here) go nowhere visible, silently leaving the window on
        // Chromium's default "can't connect" error page with zero diagnostic
        // information. A native dialog is the one channel guaranteed visible
        // regardless of how the app was launched.
        try {
          await startEmbeddedServer(config.local);
        } catch (err) {
          dialog.showErrorBox("ComiKumi konnte nicht gestartet werden", err instanceof Error ? (err.stack ?? err.message) : String(err));
          app.quit();
          return;
        }
      }
    }
    createWindow(url);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
