import { createApp } from "./app.js";
import { readSettings, getActiveScanRootForTrash } from "./lib/projectStore.js";
import { purgeExpiredTrash } from "./lib/trash.js";
import { seedDemoDataIfNeeded } from "./lib/demoMode.js";

const PORT = Number(process.env.PORT ?? 3001);
const app = createApp({ staticDir: process.env.CLIENT_DIST_DIR ?? null });

// Automates the "system administrator" cleanup role the trash folder implies: without
// this, deleted pages would accumulate in scanRoot's _trash forever. Runs against
// whichever project happens to be open at each tick (or does nothing if none is), so
// it keeps working across project switches with no per-project scheduling to manage.
const TRASH_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

async function purgeActiveProjectTrash(): Promise<void> {
  const info = await getActiveScanRootForTrash();
  if (!info) return;
  try {
    const purged = await purgeExpiredTrash(info.scanRoot, info.trashRetentionDays);
    if (purged > 0) console.log(`Papierkorb bereinigt: ${purged} Datei(en) endgültig entfernt.`);
  } catch (err) {
    console.error("Papierkorb-Bereinigung fehlgeschlagen:", err);
  }
}

await seedDemoDataIfNeeded();

app.listen(PORT, async () => {
  console.log(`ComiKumi server läuft auf http://localhost:${PORT}`);
  try {
    const settings = await readSettings();
    console.log(`Scan-Root: ${settings.scanRoot}`);
  } catch {
    console.log(`Kein Projekt geöffnet — bitte über die App ein Projekt öffnen/anlegen.`);
  }
  void purgeActiveProjectTrash();
  setInterval(() => void purgeActiveProjectTrash(), TRASH_PURGE_INTERVAL_MS);
});
