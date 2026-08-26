import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function freshDataDir(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "secretscrypto-test-"));
  process.env.LETTERING_DATA_DIR = path.join(root, "data");
}

beforeEach(async () => {
  await freshDataDir();
  const { resetSecretsKeyCacheForTests } = await import("./secretsCrypto.js");
  resetSecretsKeyCacheForTests();
});

describe("encryptSecret/decryptSecret", () => {
  it("round-trips a plaintext string", async () => {
    const { encryptSecret, decryptSecret } = await import("./secretsCrypto.js");
    const encrypted = await encryptSecret("sk-super-secret-key");
    expect(encrypted.ciphertext).not.toContain("sk-super-secret-key");
    const decrypted = await decryptSecret(encrypted);
    expect(decrypted).toBe("sk-super-secret-key");
  });

  it("produces a different ciphertext each time (random IV) but both still decrypt correctly", async () => {
    const { encryptSecret, decryptSecret } = await import("./secretsCrypto.js");
    const a = await encryptSecret("same-plaintext");
    const b = await encryptSecret("same-plaintext");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(await decryptSecret(a)).toBe("same-plaintext");
    expect(await decryptSecret(b)).toBe("same-plaintext");
  });

  it("persists the key across process-local cache resets (same data dir)", async () => {
    const { encryptSecret, decryptSecret, resetSecretsKeyCacheForTests } = await import("./secretsCrypto.js");
    const encrypted = await encryptSecret("persisted-value");
    resetSecretsKeyCacheForTests();
    expect(await decryptSecret(encrypted)).toBe("persisted-value");
  });

  it("fails to decrypt with a tampered auth tag", async () => {
    const { encryptSecret, decryptSecret } = await import("./secretsCrypto.js");
    const encrypted = await encryptSecret("tamper-me");
    const tampered = { ...encrypted, tag: encrypted.tag.replace(/^./, encrypted.tag[0] === "0" ? "1" : "0") };
    await expect(decryptSecret(tampered)).rejects.toThrow();
  });
});
