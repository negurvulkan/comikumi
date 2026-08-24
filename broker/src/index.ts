import { createApp } from "./app.js";
import { config } from "./config.js";
import { cleanupOrphansOnStartup, startIdleSweep, shutdownAll } from "./sessionManager.js";

await cleanupOrphansOnStartup();

const app = createApp();
const sweepHandle = startIdleSweep();

// Loopback-only: the browser must never reach the broker directly — only via Plesk's
// reverse proxy (TLS termination, the real demo-server.* hostname). Binding to every
// interface here would let anyone on the internet hit the broker over plain HTTP on
// this port directly, bypassing HTTPS and the CLIENT_ORIGIN/cookie design entirely.
const server = app.listen(config.brokerPort, "127.0.0.1", () => {
  console.log(`ComiKumi demo broker läuft auf http://127.0.0.1:${config.brokerPort}`);
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
