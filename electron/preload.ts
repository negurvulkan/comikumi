// Intentionally empty for now — contextIsolation is on and nodeIntegration is off
// (see main.ts's webPreferences), so the renderer gets zero Node/Electron API
// surface by default, which is exactly right today: the app talks to its own
// embedded server over plain HTTP, nothing here needs a native bridge yet. Kept
// as a real preload file (rather than omitting one) so adding a contextBridge API
// later — e.g. swapping FileBrowserModal for a native dialog.showOpenDialog() —
// doesn't require first re-deciding this security posture.
export {};
