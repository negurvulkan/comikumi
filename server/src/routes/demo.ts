import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { signToken, toPublicUser } from "../lib/authStore.js";
import { getDemoUser, appendDemoEmail } from "../lib/demoMode.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const demoRouter = Router();

// Both routes here are reachable with no credentials at all (that's the point — no
// login screen in demo mode), so they're the one part of the API that's exposed to
// unauthenticated scripted abuse. Capped per IP rather than left to the app's normal
// per-account rate profile (which doesn't exist anywhere else in this codebase).
export const demoRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

/** Issues a short-lived (6h, vs. the normal 30-day session) JWT for the single seeded
 * demo account — SessionContext.tsx calls this instead of showing /login or /setup
 * when the server reports demoMode: true. Deliberately scoped: the account is a
 * non-admin member of exactly one project (see demoMode.ts's seedDemoDataIfNeeded),
 * so a scraped token grants no more than what any visitor already sees in the UI. */
demoRouter.get(
  "/token",
  asyncHandler(async (_req, res) => {
    const user = await getDemoUser();
    if (!user) {
      res.status(503).json({ error: "demo_not_seeded" });
      return;
    }
    const token = await signToken(user, "6h");
    res.json({ token, user: toPublicUser(user) });
  })
);

const EmailSchema = z.object({ email: z.string().trim().email() });

/** Optional, skippable lead-capture gate on the client — fire-and-forget by design:
 * always responds ok so a malformed/duplicate submission never blocks entry into the
 * app. Appended (not read-modify-write) so concurrent visitors across a container's
 * lifetime can't race each other the way users.json/app-state.json would. */
demoRouter.post(
  "/email",
  asyncHandler(async (req, res) => {
    const parsed = EmailSchema.safeParse(req.body);
    if (parsed.success) await appendDemoEmail(parsed.data.email);
    res.json({ ok: true });
  })
);
