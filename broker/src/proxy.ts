import { createProxyMiddleware } from "http-proxy-middleware";
import type { Request } from "express";

// The proxied container runs its own permissive app.use(cors()) (correct for its
// normal same-origin/local deployment) — its response headers would otherwise
// overwrite the broker's own exact-origin + credentials CORS headers set earlier in
// the chain (Node's res.writeHead() replaces any same-named header already set via
// setHeader). A wildcard "*" combined with credentials is invalid per the Fetch spec,
// so leaving the upstream's headers in place would make every real browser reject the
// response outright. Strip them here so only the broker's own values reach the client.
const UPSTREAM_CORS_HEADERS = ["access-control-allow-origin", "access-control-allow-credentials", "vary"];

/** Streams both directions with no request buffering (required for 50MB multipart
 * page uploads and binary export downloads — see server/src/routes/pages.ts's multer
 * limits). Target is resolved per-request from req.demoTarget, set by
 * sessionMiddleware.ts, which always runs first. Generous timeouts accommodate large
 * uploads/downloads over a slow visitor connection. */
export const proxy = createProxyMiddleware({
  router: (req: Request) => req.demoTarget!,
  changeOrigin: true,
  proxyTimeout: 60_000,
  timeout: 60_000,
  on: {
    proxyRes: (proxyRes) => {
      for (const header of UPSTREAM_CORS_HEADERS) delete proxyRes.headers[header];
    },
    error: (err, _req, res) => {
      console.error("Proxy error:", err);
      if ("writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: "demo_container_unreachable" }));
    },
  },
});
