import { contextBridge, ipcRenderer } from "electron";

// contextIsolation is on and nodeIntegration is off (see main.ts's webPreferences),
// so this is the renderer's ONLY surface onto Electron/Node — everything exposed here
// is deliberately narrow (no raw ipcRenderer, no fs/path) and mirrors real IPC
// handlers registered in main.ts, never a passthrough to a broader API.
contextBridge.exposeInMainWorld("comikumi", {
  /** Opens `url` in the user's real OS browser instead of a second window inside this
   * app's own embedded Chromium — used by AccountSettings.tsx's Codex "Sign in with
   * ChatGPT" link. Fire-and-forget (main.ts validates the scheme before acting on it). */
  openExternal: (url: string): void => {
    ipcRenderer.send("open-external", url);
  },
  /** Only used by setup.html (the local/remote server setup screen, shown at first run
   * and again via the "Server wechseln…" menu item, see main.ts's runSetupWizard()) —
   * irrelevant, but harmless, in the main app window. */
  setup: {
    getPrefill: (): Promise<{ defaultLocalDir: string; current: unknown }> => ipcRenderer.invoke("setup:get-prefill"),
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("setup:pick-directory"),
    submit: (config: unknown): Promise<boolean> => ipcRenderer.invoke("setup:submit", config),
  },
});
