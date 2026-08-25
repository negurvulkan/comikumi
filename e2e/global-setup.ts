import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "@playwright/test";
import { E2E_SERVER_PORT, TMP_DIR } from "./playwright.config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = `http://localhost:${E2E_SERVER_PORT}`;
const ADMIN_USERNAME = "e2e-admin";
const ADMIN_PASSWORD = "e2e-test-pw-1234";
const SCAN_ROOT = path.join(TMP_DIR, "scan-root");
const BOOK_NAME = "e2e_book";
const EMPTY_SUFFIX = "_empty";
const PAGE_NAME = "page_01";
const LANGUAGE = { code: "en", label: "English", folderSuffix: "english" };
const PROJECT_FILE_PATH = path.join(TMP_DIR, "data", "e2e-project.json");

export interface FixtureData {
  baseUrl: string;
  token: string;
  username: string;
  password: string;
  volumeId: string;
  page: string;
  languageCode: string;
  languageFolderSuffix: string;
  scanRoot: string;
  bookName: string;
}

/**
 * Provisions everything the four specs need before any test runs — an admin account
 * (via the one-time `/api/auth/setup` flow, same as a fresh install's first launch),
 * and a small fixture project (one volume, one real page image) — entirely through the
 * existing project-provisioning API (server/src/routes/project.ts), not the UI, so this
 * stays fast and independent of anything the specs themselves exercise. The server was
 * started against a throwaway LETTERING_DATA_DIR (see playwright.config.ts), so this is
 * always a genuinely fresh instance with no prior users/projects.
 */
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ baseURL: BASE_URL });

  const setupRes = await api.post("/api/auth/setup", { data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD } });
  if (!setupRes.ok()) throw new Error(`/api/auth/setup failed: ${setupRes.status()} ${await setupRes.text()}`);
  const { token } = (await setupRes.json()) as { token: string };
  const authHeaders = { Authorization: `Bearer ${token}` };

  const scanRootRes = await api.post("/api/project/scan-root", { headers: authHeaders, data: { scanRoot: SCAN_ROOT } });
  if (!scanRootRes.ok()) throw new Error(`/api/project/scan-root failed: ${scanRootRes.status()} ${await scanRootRes.text()}`);

  const volumeFoldersRes = await api.post("/api/project/volume-folders", {
    headers: authHeaders,
    data: { scanRoot: SCAN_ROOT, emptySuffix: EMPTY_SUFFIX, bookName: BOOK_NAME, languageFolderSuffixes: [] },
  });
  if (!volumeFoldersRes.ok()) throw new Error(`/api/project/volume-folders failed: ${volumeFoldersRes.status()} ${await volumeFoldersRes.text()}`);

  const emptyDir = path.join(SCAN_ROOT, BOOK_NAME, `${BOOK_NAME}${EMPTY_SUFFIX}`);
  await fs.copyFile(path.join(__dirname, "fixtures", "page_01.png"), path.join(emptyDir, `${PAGE_NAME}.png`));

  const newProjectRes = await api.post("/api/project/new", {
    headers: authHeaders,
    data: {
      filePath: PROJECT_FILE_PATH,
      name: "E2E Test Project",
      scanRoot: SCAN_ROOT,
      emptySuffix: EMPTY_SUFFIX,
      languages: [LANGUAGE],
    },
  });
  if (!newProjectRes.ok()) throw new Error(`/api/project/new failed: ${newProjectRes.status()} ${await newProjectRes.text()}`);

  await api.dispose();

  const fixture: FixtureData = {
    baseUrl: BASE_URL,
    token,
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    volumeId: BOOK_NAME,
    page: PAGE_NAME,
    languageCode: LANGUAGE.code,
    languageFolderSuffix: LANGUAGE.folderSuffix,
    scanRoot: SCAN_ROOT,
    bookName: BOOK_NAME,
  };
  await fs.writeFile(path.join(TMP_DIR, "fixture.json"), JSON.stringify(fixture, null, 2));
}
