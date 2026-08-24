import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DATA_DIR, SERVER_ROOT } from "./paths.js";
import { createUser, findUserByUsername } from "./authStore.js";
import { createProject, writeMembers, getCurrentProjectInfo, openProject } from "./projectStore.js";

/** Set on the container that serves the public online demo — every other export in
 * this module becomes a no-op when this is false, so a normal (non-demo) deployment
 * is byte-for-byte unaffected by this file existing at all. */
export const DEMO_MODE = process.env.DEMO_MODE === "true";

/** Per-volume page-count ceiling enforced by routes/pages.ts's upload handler. */
export const DEMO_MAX_PAGES = Number(process.env.DEMO_MAX_PAGES ?? 8);

/** Pristine, image-baked sample volume — copied (once) into a writable runtime
 * location on first boot, see seedDemoDataIfNeeded() below. */
const DEMO_SEED_DIR = process.env.DEMO_SEED_DIR ?? path.join(SERVER_ROOT, "demo-seed");

const DEMO_SCAN_ROOT = path.join(DATA_DIR, "demo-scanroot");
const DEMO_PROJECT_FILE = path.join(DATA_DIR, "demo-project.json");
const DEMO_USERNAME = "demo";

const DEMO_EMAILS_FILE = path.join(DATA_DIR, "demo-emails.jsonl");

async function pathExists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

/** Idempotent — safe to call on every boot. Only does real work the first time a
 * given LETTERING_DATA_DIR is used, so a container that restarts without being
 * recreated (same volume mount) doesn't wipe out a visitor's in-progress session. */
export async function seedDemoDataIfNeeded(): Promise<void> {
  if (!DEMO_MODE) return;

  let user = await findUserByUsername(DEMO_USERNAME);
  if (!user) {
    // Password is never used for a real login — no login screen is reachable in
    // demo mode (see SessionContext.tsx's demoMode branch) — it only exists because
    // createUser()'s signature requires one.
    user = await createUser(DEMO_USERNAME, randomBytes(24).toString("hex"), false);
  }

  if (!(await pathExists(DEMO_SCAN_ROOT))) {
    await fs.cp(DEMO_SEED_DIR, DEMO_SCAN_ROOT, { recursive: true });
  }

  if (!(await pathExists(DEMO_PROJECT_FILE))) {
    await createProject(DEMO_PROJECT_FILE, { name: "Demo", scanRoot: DEMO_SCAN_ROOT });
    // "letterer" — high enough to actually use the product (add/delete pages, edit
    // lettering, characters, presets) but below "admin", so member-management/
    // settings UI stays hidden with zero extra client-side gating (see
    // VolumeList.tsx's hasAtLeast("admin") checks). Breaking the demo project within
    // a session is harmless: it resets whenever a fresh container starts.
    await writeMembers([{ userId: user.id, role: "letterer" }]);
  } else if (!(await getCurrentProjectInfo())) {
    // A restarted container (same data dir) that lost the in-memory "active project"
    // singleton — reopen rather than recreate, so existing session data survives.
    await openProject(DEMO_PROJECT_FILE);
  }
}

export async function getDemoUser() {
  return findUserByUsername(DEMO_USERNAME);
}

export async function appendDemoEmail(email: string): Promise<void> {
  await fs.mkdir(path.dirname(DEMO_EMAILS_FILE), { recursive: true });
  await fs.appendFile(DEMO_EMAILS_FILE, `${JSON.stringify({ email, timestamp: new Date().toISOString() })}\n`, "utf-8");
}

/** Total existing + incoming page count for `volume` would exceed DEMO_MAX_PAGES —
 * routes/pages.ts's upload handler checks this before writing any file to disk. */
export function exceedsDemoPageCap(existingCount: number, incomingCount: number): boolean {
  return DEMO_MODE && existingCount + incomingCount > DEMO_MAX_PAGES;
}
