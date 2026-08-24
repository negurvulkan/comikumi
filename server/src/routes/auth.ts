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
} from "../lib/authStore.js";
import { requireAuth, requireSystemAdmin } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { DEMO_MODE } from "../lib/demoMode.js";

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

