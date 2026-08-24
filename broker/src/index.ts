import { createApp } from "./app.js";
import { config } from "./config.js";
import { cleanupOrphansOnStartup, startIdleSweep, shutdownAll } from "./sessionManager.js";

await cleanupOrphansOnStartup();

const app = createApp();
const sweepHandle = startIdleSweep();

const server = app.listen(config.brokerPort, () => {
  console.log(`ComiKumi demo broker läuft auf http://localhost:${config.brokerPort}`);
  console.log(`Client-Origin: ${config.clientOrigin} | Demo-Image: ${config.demoImage} | Max-Sessions: ${config.maxConcurrentSessions}`);
});

async function shutdown(): Promise<void> {
  console.log("Broker wird beendet — stoppe alle Demo-Container…");
  clearInterval(sweepHandle);
  server.close();
  await shutdownAll();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
