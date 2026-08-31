import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { UserAccountListSchema, type UserAccount, type PublicUser } from "../../../shared/src/users.js";
import { USERS_FILE, AUTH_SECRET_FILE } from "./paths.js";
import { encryptSecret, decryptSecret } from "./secretsCrypto.js";

const SCRYPT_KEYLEN = 64;
const TOKEN_EXPIRY: NonNullable<SignOptions["expiresIn"]> = "30d";

export function toPublicUser(user: UserAccount): PublicUser {
  const {
    passwordHash: _passwordHash,
    openaiApiKeyEncrypted: _openaiApiKeyEncrypted,
    anthropicApiKeyEncrypted: _anthropicApiKeyEncrypted,
    googleApiKeyEncrypted: _googleApiKeyEncrypted,
    openrouterApiKeyEncrypted: _openrouterApiKeyEncrypted,
    ...rest
  } = user;
  return rest;
}

/** "<saltHex>:<hashHex>" — scrypt (Node built-in, no native dependency beyond what
 * Node already ships) instead of bcrypt/argon2, which would need native bindings and
 * complicate the already-planned Electron packaging. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time comparison (timingSafeEqual) so a failed login can't leak how many
 * leading bytes of the hash matched via response-time differences. */
export function verifyPassword(plain: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, salt, SCRYPT_KEYLEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function readUsersRaw(): Promise<UserAccount[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf-8");
    return UserAccountListSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeUsersRaw(users: UserAccount[]): Promise<void> {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export async function hasAnyUsers(): Promise<boolean> {
  return (await readUsersRaw()).length > 0;
}

export async function listUsers(): Promise<PublicUser[]> {
  return (await readUsersRaw()).map(toPublicUser);
}

export async function findUserById(id: string): Promise<UserAccount | undefined> {
  return (await readUsersRaw()).find((u) => u.id === id);
}

export async function findUserByUsername(username: string): Promise<UserAccount | undefined> {
  return (await readUsersRaw()).find((u) => u.username.toLowerCase() === username.toLowerCase());
}

/** Used by routes/auth.ts's /setup (only allowed once, when hasAnyUsers() is false)
 * and /users (system-admin only, for every subsequent account). */
export async function createUser(username: string, password: string, isSystemAdmin: boolean): Promise<UserAccount> {
  const users = await readUsersRaw();
  const user: UserAccount = {
    id: randomUUID(),
    username,
    passwordHash: hashPassword(password),
    isSystemAdmin,
    createdAt: new Date().toISOString(),
  };
  await writeUsersRaw([...users, user]);
  return user;
}

export async function deleteUser(id: string): Promise<PublicUser[]> {
  const users = await readUsersRaw();
  // Prevent deleting the last system admin
  const userToDelete = users.find((u) => u.id === id);
  if (userToDelete?.isSystemAdmin) {
    const otherAdmins = users.filter((u) => u.id !== id && u.isSystemAdmin);
    if (otherAdmins.length === 0) {
      throw new Error("cannot_remove_last_system_admin");
    }
  }
  const next = users.filter((u) => u.id !== id);
  await writeUsersRaw(next);
  return next.map(toPublicUser);
}

export async function updateUser(
  id: string,
  // `email: null` clears it (JSON has no "delete this field" signal otherwise);
  // `undefined`/omitted leaves it untouched — same distinction PATCH-style updates
  // need everywhere else in this codebase. `openaiApiKey`/`anthropicApiKey`/
  // `googleApiKey`/`openrouterApiKey` take the PLAINTEXT key in (encrypted here, at
  // the storage boundary) and follow the same omit/set/null-clear convention.
  // `ollamaBaseUrl`/`ollamaModel` are plain text (no secret to encrypt — see
  // shared/src/users.ts's doc comment on those two fields).
  updates: {
    password?: string;
    isSystemAdmin?: boolean;
    email?: string | null;
    openaiApiKey?: string | null;
    anthropicApiKey?: string | null;
    googleApiKey?: string | null;
    openrouterApiKey?: string | null;
    ollamaBaseUrl?: string | null;
    ollamaModel?: string | null;
  }
): Promise<UserAccount> {
  const users = await readUsersRaw();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) {
    throw new Error("user_not_found");
  }
  const user = users[index];

  if (updates.isSystemAdmin === false && user.isSystemAdmin) {
    const otherAdmins = users.filter((u) => u.id !== id && u.isSystemAdmin);
    if (otherAdmins.length === 0) {
      throw new Error("cannot_remove_last_system_admin");
    }
  }

  if (updates.password !== undefined) {
    user.passwordHash = hashPassword(updates.password);
  }
  if (updates.isSystemAdmin !== undefined) {
    user.isSystemAdmin = updates.isSystemAdmin;
  }
  if (updates.email !== undefined) {
    if (updates.email === null) delete user.email;
    else user.email = updates.email;
  }
  if (updates.openaiApiKey !== undefined) {
    if (updates.openaiApiKey === null) delete user.openaiApiKeyEncrypted;
    else user.openaiApiKeyEncrypted = await encryptSecret(updates.openaiApiKey);
  }
  if (updates.anthropicApiKey !== undefined) {
    if (updates.anthropicApiKey === null) delete user.anthropicApiKeyEncrypted;
    else user.anthropicApiKeyEncrypted = await encryptSecret(updates.anthropicApiKey);
  }
  if (updates.googleApiKey !== undefined) {
    if (updates.googleApiKey === null) delete user.googleApiKeyEncrypted;
    else user.googleApiKeyEncrypted = await encryptSecret(updates.googleApiKey);
  }
  if (updates.openrouterApiKey !== undefined) {
    if (updates.openrouterApiKey === null) delete user.openrouterApiKeyEncrypted;
    else user.openrouterApiKeyEncrypted = await encryptSecret(updates.openrouterApiKey);
  }
  if (updates.ollamaBaseUrl !== undefined) {
    if (updates.ollamaBaseUrl === null) delete user.ollamaBaseUrl;
    else user.ollamaBaseUrl = updates.ollamaBaseUrl;
  }
  if (updates.ollamaModel !== undefined) {
    if (updates.ollamaModel === null) delete user.ollamaModel;
    else user.ollamaModel = updates.ollamaModel;
  }

  await writeUsersRaw(users);
  return user;
}

/** Decrypts the caller's own stored OpenAI key for the one moment it's actually
 * needed (an outgoing request to the OpenAI API, see lib/ai/openaiProvider.ts) —
 * never cached, never returned to any route handler that could leak it back to a
 * client. Returns null if the user hasn't configured one. */
export async function getDecryptedOpenAIKey(id: string): Promise<string | null> {
  const user = await findUserById(id);
  if (!user?.openaiApiKeyEncrypted) return null;
  return decryptSecret(user.openaiApiKeyEncrypted);
}

/** Same "decrypt only at the moment of the outgoing request" contract as
 * getDecryptedOpenAIKey — see lib/ai/anthropicProvider.ts. */
export async function getDecryptedAnthropicKey(id: string): Promise<string | null> {
  const user = await findUserById(id);
  if (!user?.anthropicApiKeyEncrypted) return null;
  return decryptSecret(user.anthropicApiKeyEncrypted);
}

/** Same "decrypt only at the moment of the outgoing request" contract as
 * getDecryptedOpenAIKey — see lib/ai/geminiProvider.ts. */
export async function getDecryptedGoogleKey(id: string): Promise<string | null> {
  const user = await findUserById(id);
  if (!user?.googleApiKeyEncrypted) return null;
  return decryptSecret(user.googleApiKeyEncrypted);
}

/** Same "decrypt only at the moment of the outgoing request" contract as
 * getDecryptedOpenAIKey — see lib/ai/openrouterProvider.ts. */
export async function getDecryptedOpenRouterKey(id: string): Promise<string | null> {
  const user = await findUserById(id);
  if (!user?.openrouterApiKeyEncrypted) return null;
  return decryptSecret(user.openrouterApiKeyEncrypted);
}

/** No decryption involved (see shared/src/users.ts's doc comment — Ollama has no
 * secret) — just the two plain fields, or null if either is missing, see
 * lib/ai/ollamaProvider.ts. */
export async function getOllamaConfig(id: string): Promise<{ baseUrl: string; model: string } | null> {
  const user = await findUserById(id);
  if (!user?.ollamaBaseUrl || !user?.ollamaModel) return null;
  return { baseUrl: user.ollamaBaseUrl, model: user.ollamaModel };
}

export interface AIProviderStatus {
  openai: { configured: boolean };
  anthropic: { configured: boolean };
  google: { configured: boolean };
  openrouter: { configured: boolean };
  ollama: { configured: boolean; baseUrl?: string; model?: string };
}

/** Safe-to-send-to-the-client summary of which AI providers this account has
 * configured — never the secret itself (see toPublicUser()'s own doc comment for why
 * every `*ApiKeyEncrypted` field never round-trips to the browser at all). Codex's
 * status is NOT reported here — it's derived live from CODEX_HOME file presence/the
 * running app-server process, see lib/ai/codexProcessManager.ts. Ollama's entry is the
 * one exception that includes real values (baseUrl/model) instead of just a boolean —
 * neither is a secret, and showing them lets the account settings form pre-fill the
 * current values instead of a blind re-entry like the key-based providers. */
export function toAIProviderStatus(user: UserAccount): AIProviderStatus {
  return {
    openai: { configured: user.openaiApiKeyEncrypted !== undefined },
    anthropic: { configured: user.anthropicApiKeyEncrypted !== undefined },
    google: { configured: user.googleApiKeyEncrypted !== undefined },
    openrouter: { configured: user.openrouterApiKeyEncrypted !== undefined },
    ollama: {
      configured: !!user.ollamaBaseUrl && !!user.ollamaModel,
      baseUrl: user.ollamaBaseUrl,
      model: user.ollamaModel,
    },
  };
}


let cachedSecret: string | null = null;

/** Auto-generated once (crypto.randomBytes) and persisted if missing — matches this
 * app's "no required configuration" philosophy (e.g. PORT in index.ts is optional
 * too). Cached in-memory after the first read within a process. */
async function getOrCreateAuthSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  try {
    cachedSecret = (await fs.readFile(AUTH_SECRET_FILE, "utf-8")).trim();
    if (cachedSecret) return cachedSecret;
  } catch {
    // doesn't exist yet — fall through to generate one
  }
  cachedSecret = randomBytes(32).toString("hex");
  await fs.mkdir(path.dirname(AUTH_SECRET_FILE), { recursive: true });
  await fs.writeFile(AUTH_SECRET_FILE, cachedSecret, "utf-8");
  return cachedSecret;
}

/** Test-only escape hatch, mirroring projectStore.ts's resetActiveProjectForTests —
 * clears the in-memory secret cache so tests pointed at a fresh LETTERING_DATA_DIR
 * don't accidentally reuse a previous test file's secret. */
export function resetAuthSecretCacheForTests(): void {
  cachedSecret = null;
}

export interface AuthTokenPayload {
  sub: string;
  username: string;
  isSystemAdmin: boolean;
}

/** `expiresIn` defaults to the normal 30-day session but can be shortened for
 * tokens with a narrower purpose (e.g. demo.ts's auto-issued demo-user token, kept
 * short-lived since it's handed out with no credentials at all). */
export async function signToken(
  user: UserAccount,
  expiresIn: NonNullable<SignOptions["expiresIn"]> = TOKEN_EXPIRY
): Promise<string> {
  const secret = await getOrCreateAuthSecret();
  const payload: AuthTokenPayload = { sub: user.id, username: user.username, isSystemAdmin: user.isSystemAdmin };
  return jwt.sign(payload, secret, { expiresIn });
}

/** Returns null for any invalid/expired/missing token rather than throwing — callers
 * (server/src/lib/auth.ts's requireAuth) turn a null into a 401, same "don't crash on
 * bad input" spirit as every other schema-validation spot in this codebase. */
export async function verifyToken(token: string): Promise<AuthTokenPayload | null> {
  const secret = await getOrCreateAuthSecret();
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== "object" || decoded === null) return null;
    const { sub, username, isSystemAdmin } = decoded as Partial<AuthTokenPayload>;
    if (typeof sub !== "string" || typeof username !== "string" || typeof isSystemAdmin !== "boolean") return null;
    return { sub, username, isSystemAdmin };
  } catch {
    return null;
  }
}
