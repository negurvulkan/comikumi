import { Router } from "express";
import { z } from "zod";
import {
  hasAnyUsers,
  createUser,
  deleteUser,
  updateUser,
  listUsers,
  findUserById,
  findUserByUsername,
  verifyPassword,
  signToken,
  toPublicUser,
  toAIProviderStatus,
} from "../lib/authStore.js";
import { requireAuth, requireSystemAdmin } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { DEMO_MODE } from "../lib/demoMode.js";
import {
  startCodexLogin,
  getCodexLoginStatus,
  cancelCodexLogin,
  logoutCodex,
  isCodexLoggedIn,
  getCodexRateLimits,
} from "../lib/ai/codexProcessManager.js";

export const authRouter = Router();

const CredentialsSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1),
});

/** Only ever succeeds once — the very first account it creates becomes
 * isSystemAdmin (see shared/src/users.ts), so the server always has at least one
 * account with full access without any manual migration. Every subsequent account is
 * created via POST /users (requireSystemAdmin) instead. */
authRouter.post(
  "/setup",
  asyncHandler(async (req, res) => {
    if (await hasAnyUsers()) {
      res.status(400).json({ error: "setup_already_completed" });
      return;
    }
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    const user = await createUser(parsed.data.username, parsed.data.password, true);
    const token = await signToken(user);
    res.status(201).json({ token, user: toPublicUser(user) });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = CredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    const user = await findUserByUsername(parsed.data.username);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    const token = await signToken(user);
    res.json({ token, user: toPublicUser(user) });
  })
);

/** Bootstraps the client's SessionContext: whether the caller is logged in
 * (requires a valid token — reuses requireAuth here rather than a separate optional-
 * auth path, so an invalid/missing token cleanly 401s) and, separately, whether the
 * server has any accounts yet at all (so the client can decide between /login and
 * /setup without a second round-trip). */
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.user!.sub);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    res.json(toPublicUser(user));
  })
);

const UpdateOwnProfileSchema = z.object({
  email: z.string().trim().email().nullable().optional(),
});

/** Self-service — unlike PATCH /users/:id (requireSystemAdmin, can edit anyone), this
 * lets the logged-in user set/clear their OWN email without needing admin rights, so a
 * system admin doesn't have to know and enter every teammate's address by hand for
 * @-mention notifications to work (see server/src/lib/mailer.ts). Deliberately only
 * `email` for now — password changes already have their own dedicated
 * /change-password route (which additionally verifies the current password). */
authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = UpdateOwnProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    const user = await updateUser(req.user!.sub, parsed.data);
    res.json(toPublicUser(user));
  })
);

/** Public (no auth required) — the client's very first request, before it knows
 * whether to show /login or /setup. `demoMode` lets SessionContext.tsx skip both
 * screens entirely and fetch an auto-issued token from /api/demo/token instead. */
authRouter.get(
  "/setup-status",
  asyncHandler(async (_req, res) => {
    res.json({ hasAnyUsers: await hasAnyUsers(), demoMode: DEMO_MODE });
  })
);

authRouter.get(
  "/users",
  requireAuth,
  requireSystemAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
  })
);

const NewUserSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1),
  isSystemAdmin: z.boolean().default(false),
});

authRouter.post(
  "/users",
  requireAuth,
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = NewUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    if (await findUserByUsername(parsed.data.username)) {
      res.status(400).json({ error: "username_already_exists" });
      return;
    }
    const user = await createUser(parsed.data.username, parsed.data.password, parsed.data.isSystemAdmin);
    res.status(201).json(toPublicUser(user));
  })
);

authRouter.delete(
  "/users/:id",
  requireAuth,
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.sub) {
      res.status(400).json({ error: "cannot_delete_own_account" });
      return;
    }
    try {
      res.json(await deleteUser(req.params.id));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  })
);

const UpdateUserSchema = z.object({
  password: z.string().min(1).optional(),
  isSystemAdmin: z.boolean().optional(),
  email: z.string().trim().email().nullable().optional(),
});

authRouter.patch(
  "/users/:id",
  requireAuth,
  requireSystemAdmin,
  asyncHandler(async (req, res) => {
    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    if (req.params.id === req.user!.sub && parsed.data.isSystemAdmin === false) {
      res.status(400).json({ error: "cannot_demote_own_account" });
      return;
    }
    try {
      const user = await updateUser(req.params.id, parsed.data);
      res.json(toPublicUser(user));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  })
);

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    const user = await findUserById(req.user!.sub);
    if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      res.status(400).json({ error: "invalid_credentials" });
      return;
    }
    try {
      await updateUser(user.id, { password: parsed.data.newPassword });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  })
);

// --- AI provider configuration (self-service, per account — never project- or
// instance-wide, see docs/FEATURES.md and the multi-provider-assistant plan). ---

const SetOpenAIKeySchema = z.object({ apiKey: z.string().min(1) });

authRouter.put(
  "/me/openai-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = SetOpenAIKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    await updateUser(req.user!.sub, { openaiApiKey: parsed.data.apiKey });
    res.json({ ok: true });
  })
);

authRouter.delete(
  "/me/openai-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    await updateUser(req.user!.sub, { openaiApiKey: null });
    res.json({ ok: true });
  })
);

// Anthropic/Google/OpenRouter key routes below are exact copies of the OpenAI pair
// above — same self-service, same validation, same encrypt-at-the-boundary/null-clears
// convention (see authStore.ts's updateUser doc comment) — only the field name differs.

const SetAnthropicKeySchema = z.object({ apiKey: z.string().min(1) });

authRouter.put(
  "/me/anthropic-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = SetAnthropicKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    await updateUser(req.user!.sub, { anthropicApiKey: parsed.data.apiKey });
    res.json({ ok: true });
  })
);

authRouter.delete(
  "/me/anthropic-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    await updateUser(req.user!.sub, { anthropicApiKey: null });
    res.json({ ok: true });
  })
);

const SetGoogleKeySchema = z.object({ apiKey: z.string().min(1) });

authRouter.put(
  "/me/google-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = SetGoogleKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    await updateUser(req.user!.sub, { googleApiKey: parsed.data.apiKey });
    res.json({ ok: true });
  })
);

authRouter.delete(
  "/me/google-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    await updateUser(req.user!.sub, { googleApiKey: null });
    res.json({ ok: true });
  })
);

const SetOpenRouterKeySchema = z.object({ apiKey: z.string().min(1) });

authRouter.put(
  "/me/openrouter-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = SetOpenRouterKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    await updateUser(req.user!.sub, { openrouterApiKey: parsed.data.apiKey });
    res.json({ ok: true });
  })
);

authRouter.delete(
  "/me/openrouter-key",
  requireAuth,
  asyncHandler(async (req, res) => {
    await updateUser(req.user!.sub, { openrouterApiKey: null });
    res.json({ ok: true });
  })
);

// Ollama has no secret (see shared/src/users.ts) — a plain {baseUrl, model} pair
// instead of an {apiKey}, otherwise the same self-service PUT/DELETE shape.
const SetOllamaConfigSchema = z.object({ baseUrl: z.string().trim().min(1), model: z.string().trim().min(1) });

authRouter.put(
  "/me/ollama-config",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = SetOllamaConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }
    await updateUser(req.user!.sub, { ollamaBaseUrl: parsed.data.baseUrl, ollamaModel: parsed.data.model });
    res.json({ ok: true });
  })
);

authRouter.delete(
  "/me/ollama-config",
  requireAuth,
  asyncHandler(async (req, res) => {
    await updateUser(req.user!.sub, { ollamaBaseUrl: null, ollamaModel: null });
    res.json({ ok: true });
  })
);

/** Never returns the key itself (encrypted or not) — just enough for the client to
 * know which providers are usable (see AccountSettings.tsx/AIPanel.tsx). Codex's
 * status is derived live from CODEX_HOME file presence / the running app-server
 * process, not from anything stored in users.json. */
authRouter.get(
  "/me/ai-status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.user!.sub);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const { openai, anthropic, google, openrouter, ollama } = toAIProviderStatus(user);
    const codexConfigured = await isCodexLoggedIn(req.user!.sub);
    const codexRateLimits = codexConfigured ? await getCodexRateLimits(req.user!.sub) : null;
    res.json({
      openai,
      anthropic,
      google,
      openrouter,
      ollama,
      codex: { configured: codexConfigured, planType: codexRateLimits?.planType, usedPercent: codexRateLimits?.usedPercent },
    });
  })
);

authRouter.post(
  "/me/codex-login",
  requireAuth,
  asyncHandler(async (req, res) => {
    const start = await startCodexLogin(req.user!.sub);
    res.json(start);
  })
);

authRouter.get(
  "/me/codex-login/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = getCodexLoginStatus(req.user!.sub);
    if (!status) {
      res.status(404).json({ error: "no_login_in_progress" });
      return;
    }
    res.json(status);
  })
);

authRouter.delete(
  "/me/codex-login",
  requireAuth,
  asyncHandler(async (req, res) => {
    await cancelCodexLogin(req.user!.sub);
    res.json({ ok: true });
  })
);

authRouter.delete(
  "/me/codex-session",
  requireAuth,
  asyncHandler(async (req, res) => {
    await logoutCodex(req.user!.sub);
    res.json({ ok: true });
  })
);

