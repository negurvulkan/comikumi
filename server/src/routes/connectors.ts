import { Router } from "express";
import { CONNECTOR_IDS } from "../../../shared/src/connectors.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getConnector, listConnectors } from "../lib/connectors/registry.js";
import { createPkcePair } from "../lib/connectors/aiMangaConnector.js";
import { createPendingAuthorization, consumePendingAuthorization } from "../lib/oauthStateStore.js";
import { findUserById, updateUser, toAiMangaConnectionStatus } from "../lib/authStore.js";

/**
 * Account-level connector management (connect/disconnect, status) — not project-scoped
 * at all, same mount shape as /api/ai (see app.ts's own doc comment on that route: "own
 * subsystem", requireAuth only, no project role). Publishing itself is a separate,
 * volume-scoped router (routes/connectorPublish.ts) since it needs requireLetterer.
 */
export const connectorsRouter = Router();

connectorsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.user!.sub);
    const statuses = listConnectors().map((connector) => ({
      id: connector.id,
      configured: connector.isConfigured(),
      ...(connector.id === "ai-manga" && user ? toAiMangaConnectionStatus(user) : { connected: false }),
    }));
    res.json(statuses);
  })
);

connectorsRouter.get(
  "/:id/authorize",
  requireAuth,
  asyncHandler(async (req, res) => {
    const connector = getConnector(req.params.id);
    if (!connector || !CONNECTOR_IDS.includes(req.params.id as (typeof CONNECTOR_IDS)[number])) {
      res.status(404).json({ error: "connector_not_found" });
      return;
    }
    if (!connector.isConfigured()) {
      res.status(409).json({ error: "connector_not_configured" });
      return;
    }
    const redirectUri = process.env.AI_MANGA_REDIRECT_URI!;
    const { codeVerifier, codeChallenge } = createPkcePair();
    const state = createPendingAuthorization(connector.id, req.user!.sub, codeVerifier);
    const url = connector.buildAuthorizeUrl({ redirectUri, state, codeChallenge });
    res.json({ url });
  })
);

/**
 * Public route — the external OAuth redirect lands here directly from the user's
 * browser, with no Authorization header at all (see requireAuth's own doc comment on
 * why that's the norm for every other route). `state` (single-use, see
 * oauthStateStore.ts) is what ties this request back to a specific ComiKumi account.
 */
connectorsRouter.get(
  "/:id/callback",
  asyncHandler(async (req, res) => {
    const connector = getConnector(req.params.id);
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    const pending = typeof state === "string" ? consumePendingAuthorization(state) : undefined;
    if (!connector || !pending || pending.connectorId !== req.params.id) {
      res.status(400).send(callbackHtml("Diese Verbindung ist ungültig oder abgelaufen. Bitte erneut versuchen."));
      return;
    }
    if (error || typeof code !== "string") {
      res.status(400).send(callbackHtml(`Verbindung abgebrochen${error ? ` (${error})` : ""}.`));
      return;
    }
    try {
      const redirectUri = process.env.AI_MANGA_REDIRECT_URI!;
      const tokens = await connector.exchangeCodeForTokens({ code, redirectUri, codeVerifier: pending.codeVerifier });
      const accountLabel = await connector.fetchAccountLabel(tokens.accessToken);
      await updateUser(pending.userId, {
        aiMangaConnection: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          accountLabel,
        },
      });
      res.send(callbackHtml(`Verbunden als ${accountLabel}. Dieses Fenster kann geschlossen werden.`, true));
    } catch (err) {
      res.status(502).send(callbackHtml(`Verbindung fehlgeschlagen: ${(err as Error).message}`));
    }
  })
);

/** Minimal, dependency-free confirmation page — this route is opened as a real browser
 * tab/window (shell.openExternal in Electron, window.open on the web), not fetched by
 * the SPA, so it needs to stand on its own rather than redirect into client-side
 * routing. `window.close()` only works for a window opened via script (true for
 * shell.openExternal's target and window.open()); if it doesn't close, the message
 * itself already tells the user it's safe to close by hand. */
function callbackHtml(message: string, success = false): string {
  const escaped = message.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><title>ComiKumi</title></head>
<body style="font-family:sans-serif;padding:2rem;color:${success ? "#1a7f37" : "#b42318"}">
<p>${escaped}</p>
<script>window.close();</script>
</body></html>`;
}

connectorsRouter.post(
  "/:id/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.params.id !== "ai-manga") {
      res.status(404).json({ error: "connector_not_found" });
      return;
    }
    await updateUser(req.user!.sub, { aiMangaConnection: null });
    res.json({ ok: true });
  })
);
