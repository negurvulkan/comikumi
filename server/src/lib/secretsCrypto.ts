import fs from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SECRETS_KEY_FILE } from "./paths.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

export interface EncryptedSecret {
  iv: string;
  tag: string;
  ciphertext: string;
}

let cachedKey: Buffer | null = null;

/** Auto-generated once (crypto.randomBytes) and persisted if missing — same pattern
 * as authStore.ts's getOrCreateAuthSecret(), but a deliberately separate key/file:
 * this one encrypts per-user secrets at rest (currently just the OpenAI API key
 * stored on UserAccount), the other only signs JWTs. Cached in-memory after the
 * first read within a process. */
async function getOrCreateEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  try {
    const hex = (await fs.readFile(SECRETS_KEY_FILE, "utf-8")).trim();
    if (hex) {
      cachedKey = Buffer.from(hex, "hex");
      return cachedKey;
    }
  } catch {
    // doesn't exist yet — fall through to generate one
  }
  cachedKey = randomBytes(KEY_LENGTH_BYTES);
  await fs.mkdir(path.dirname(SECRETS_KEY_FILE), { recursive: true });
  await fs.writeFile(SECRETS_KEY_FILE, cachedKey.toString("hex"), "utf-8");
  return cachedKey;
}

/** Test-only escape hatch, mirroring authStore.ts's resetAuthSecretCacheForTests. */
export function resetSecretsKeyCacheForTests(): void {
  cachedKey = null;
}

export async function encryptSecret(plaintext: string): Promise<EncryptedSecret> {
  const key = await getOrCreateEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return { iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("hex") };
}

export async function decryptSecret(secret: EncryptedSecret): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, "hex"));
  decipher.setAuthTag(Buffer.from(secret.tag, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "hex")), decipher.final()]);
  return plaintext.toString("utf-8");
}
