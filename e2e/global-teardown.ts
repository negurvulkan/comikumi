import fs from "node:fs/promises";
import { TMP_DIR } from "./playwright.config";

export default async function globalTeardown(): Promise<void> {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
}
