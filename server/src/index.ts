import { createApp } from "./app.js";
import { readSettings } from "./lib/projectStore.js";

const PORT = Number(process.env.PORT ?? 3001);
const app = createApp();

app.listen(PORT, async () => {
  console.log(`Lettering-Tool server läuft auf http://localhost:${PORT}`);
  try {
    const settings = await readSettings();
    console.log(`Scan-Root: ${settings.scanRoot}`);
  } catch {
    console.log(`Kein Projekt geöffnet — bitte über die App ein Projekt öffnen/anlegen.`);
  }
});
