# ComiKumi Desktop (Electron)

Wraps the existing client (`client/dist`) and server (`server/dist`) in a
single desktop app — no separate server process to start by hand, no ports
to remember (unless you'd rather point it at a server running elsewhere —
see below). See the root `README.md` for what ComiKumi itself does; this
file only covers how the desktop build is packaged and how it boots.

## How it works

`main.ts` embeds the server **in-process** (a real `import()` of
`server/dist/server/src/index.js`, not a spawned child process) rather than
maintaining a second, divergent server-boot path — the desktop build sets
the exact same env vars (`PORT`, `CLIENT_DIST_DIR`, `LETTERING_DATA_DIR`)
the Docker demo image already uses (see the repo root's `Dockerfile`), so
`server/src/index.ts` behaves identically either way. This only happens in
**local** mode (see below) — in **remote** mode nothing is started locally
at all, the window just loads the remote server's own URL, same as pointing
a normal browser at it (the client already only ever makes same-origin
`/api/*` calls — see the root README's "Running client and server on
separate hosts" — so this needs zero client-side changes).

`preload.ts` exposes a narrow `window.comikumi` bridge (`contextIsolation`
is on, `nodeIntegration` is off) for the handful of things the renderer
genuinely needs native OS access for — currently: opening a link in the
user's real browser (used by the Codex "Sign in with ChatGPT" flow in
`AccountSettings.tsx`) and the setup screen below. This is attached
regardless of local/remote mode, so it works the same way against a remote
server's own UI too. Nothing else is exposed.

## Setup: local vs. remote server

On first launch of a **packaged** build (never in dev — see below), before
anything else starts, `main.ts` shows `setup.html` — a plain static page
(no build step, no framework; it can't use the client's own React/i18n
bundle since no server is serving it yet) with two modes:

- **Lokaler Server**: where to store app data (accounts, settings, caches
  — **not** the user's manga projects themselves, which are configured
  separately per-project via the in-app Project Wizard) and which local
  port to bind. This is the original/default behavior.
- **Remote-Server**: a plain URL of an already-running ComiKumi server
  (self-hosted on the network, or anywhere reachable) — the desktop app
  becomes a thin wrapper around that server's own web UI instead of
  running one itself.

The choice is saved to `<userData>/comikumi-config.json` and reused on
every later launch without asking again — but unlike the very first
version of this screen, it's revisitable anytime via the app menu
(**Datei → Server wechseln…** / **ComiKumi → Server wechseln…** on macOS),
which reopens the same screen prefilled with the current settings and
offers to relaunch once you save. Both `local` and `remoteUrl` settings are
kept in the saved config even when only one is active, so switching back
and forth doesn't lose whichever one isn't currently selected.

The local data directory specifically **can** be changed via this screen,
but changing it never migrates anything — it holds live account/auth-secret
state (see `server/src/lib/paths.ts`'s `USERS_FILE`/`AUTH_SECRET_FILE`
etc.), so pointing it at a different (possibly empty) folder just means
"no existing accounts here anymore," not "moved." A real migration flow
(copy the old directory's contents, re-point config) is a separate feature,
not implemented yet — `setup.html` shows an inline warning about this
rather than blocking the field outright.

## Building

```bash
npm run electron:build        # current platform
npm run electron:build:win    # explicit Windows target (nsis)
npm run electron:build:mac    # explicit macOS target (dmg)
npm run electron:build:linux  # explicit Linux target (AppImage)
```

Each compiles the client, server, and `electron/main.ts`/`preload.ts`
(`tsc -p electron`), then runs `electron-builder` per the root
`package.json`'s `"build"` config. Output lands in `release/`. Prebuilt
Windows/macOS (arm64)/Linux installers are published as GitHub Release
assets (see the root [README.md](../README.md#1-download)) — building your
own from source (this section) is only needed for development or an
unpublished platform/architecture.

`extraResources` copies `server/dist`, `server/node_modules`,
`server/package.json`, and `client/dist` as **plain files**, not packed
into `app.asar` — this sidesteps needing `asarUnpack` for `sharp`'s native
binary: node_modules living outside the asar archive resolve exactly like
a normal on-disk install. If you add a new top-level asset the packaged app
needs at runtime (e.g. `setup.html`), it needs an entry in **both**
electron-builder's `"files"` list (root `package.json`) **and**, if it's
something `main.ts` loads by relative path, match `main.ts`'s own
`path.join(__dirname, ...)` assumptions — see `iconPath`/`setup.html`'s
resolution in `main.ts` for the existing pattern.

## Dev mode

```bash
npm run electron:dev
```

Runs the real dev server (`tsx watch`, port 3001) and Vite client
separately (same as plain `npm run dev`), plus an Electron window pointed
at Vite's dev server URL — `main.ts` only embeds the server, shows the
setup wizard, and reads `comikumi-config.json` when `app.isPackaged` is
true, so none of that runs in dev; the window just connects to whatever
`npm run dev` already has listening.
