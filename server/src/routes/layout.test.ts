import { beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { setupTestEnv, writeLetteringFixture, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

let app: Express;
let env: TestEnv;
let api: ReturnType<typeof authedAgent>;

beforeAll(async () => {
  env = await setupTestEnv();
  const { createApp } = await import("../app.js");
  const { createProject } = await import("../lib/projectStore.js");
  app = createApp();
  api = authedAgent(app, env.token);
  await createProject(env.projectFile, { name: "Test Project", scanRoot: env.scanRoot });
});

const VOLUME_ID = "Volume_01";

describe("GET /:id/pages/:page/layout", () => {
  it("returns a synthesized empty layout (derived from the source image) when nothing was saved yet, with the \"new\" sentinel ETag", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_01/layout`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: "page_01", sourceImage: "page_01.png", imageWidth: 4, imageHeight: 4, bubbles: [] });
    expect(res.headers["etag"]).toBe('"new"');
  });

  it("404s for an unknown volume", async () => {
    const res = await api.get(`/api/volumes/does-not-exist/pages/page_01/layout`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /:id/pages/:page/layout", () => {
  it("rejects a body that doesn't match PageLayoutSchema", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_01/layout`).send({ page: "page_01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_layout");
  });

  it("saves a valid layout and it's readable back afterward", async () => {
    const layout = {
      page: "page_01",
      sourceImage: "page_01.png",
      imageWidth: 4,
      imageHeight: 4,
      bubbles: [],
      images: [],
      curvedTexts: [],
      panels: [],
    };
    const put = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_01/layout`).send(layout);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const get = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_01/layout`);
    expect(get.body).toMatchObject({ page: "page_01", imageWidth: 4 });
  });
});

describe("optimistic concurrency (ETag / If-Match)", () => {
  const layout = {
    page: "page_09",
    sourceImage: "page_01.png",
    imageWidth: 4,
    imageHeight: 4,
    bubbles: [],
    images: [],
    curvedTexts: [],
    panels: [],
  };

  it("PUT with If-Match: \"new\" succeeds for a page that has never been saved", async () => {
    const res = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_11/layout`).set("If-Match", '"new"').send({ ...layout, page: "page_11" });
    expect(res.status).toBe(200);
  });

  it("PUT without If-Match always succeeds (unchanged last-write-wins behavior)", async () => {
    const first = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`).send(layout);
    expect(first.status).toBe(200);
    const second = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`).send(layout);
    expect(second.status).toBe(200);
  });

  it("PUT with a matching If-Match succeeds and returns a fresh ETag", async () => {
    const get = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`);
    const etag = get.headers["etag"] as string;
    const put = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`).set("If-Match", etag).send(layout);
    expect(put.status).toBe(200);
    expect(put.headers["etag"]).toBeTruthy();
  });

  it("PUT with a stale If-Match 409s with the currently-saved layout instead of overwriting it", async () => {
    const get = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`);
    const staleEtag = get.headers["etag"] as string;

    // Someone else saves in the meantime.
    const otherChange = { ...layout, bubbles: [{ id: "b1", shape: "rect", x: 1, y: 1, width: 2, height: 2, text: { en: "other" } }] };
    const otherSave = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`).send(otherChange);
    expect(otherSave.status).toBe(200);

    // This session's save, still using the now-stale ETag, must be rejected rather than
    // silently overwriting the other change.
    const conflictingSave = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`).set("If-Match", staleEtag).send(layout);
    expect(conflictingSave.status).toBe(409);
    expect(conflictingSave.body.error).toBe("layout_conflict");
    expect(conflictingSave.body.currentLayout.bubbles).toHaveLength(1);

    // The other change is still intact on disk.
    const final = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_09/layout`);
    expect(final.body.bubbles).toHaveLength(1);
  });

  it("PUT with If-Match of \"new\" 409s if someone else already created the page in the meantime", async () => {
    const create = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_10/layout`).send({ ...layout, page: "page_10" });
    expect(create.status).toBe(200);

    const res = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_10/layout`).set("If-Match", '"new"').send({ ...layout, page: "page_10" });
    expect(res.status).toBe(409);
  });
});

describe("permissions: translator role (text-only diff guard)", () => {
  it("can change bubble text but not bubble geometry", async () => {
    const baseLayout = {
      page: "page_05",
      sourceImage: "page_01.png",
      imageWidth: 4,
      imageHeight: 4,
      bubbles: [{ id: "b1", shape: "rect", x: 1, y: 1, width: 2, height: 2, text: { en: "" } }],
      images: [],
      curvedTexts: [],
      panels: [],
    };
    const save = await api.put(`/api/volumes/${VOLUME_ID}/pages/page_05/layout`).send(baseLayout);
    expect(save.status).toBe(200);

    const { createUser } = await import("../lib/authStore.js");
    await createUser("translator-user", "pw", false);
    const loginRes = await api.post("/api/auth/login").send({ username: "translator-user", password: "pw" });
    const translatorToken = loginRes.body.token as string;
    const addMember = await api.post("/api/project/members").send({ username: "translator-user", role: "translator" });
    expect(addMember.status).toBe(201);

    const translatorApi = authedAgent(app, translatorToken);

    const textOnlyChange = { ...baseLayout, bubbles: [{ ...baseLayout.bubbles[0], text: { en: "Hello" } }] };
    const textRes = await translatorApi.put(`/api/volumes/${VOLUME_ID}/pages/page_05/layout`).send(textOnlyChange);
    expect(textRes.status).toBe(200);

    const geometryChange = { ...baseLayout, bubbles: [{ ...baseLayout.bubbles[0], x: 99, text: { en: "Hello" } }] };
    const geometryRes = await translatorApi.put(`/api/volumes/${VOLUME_ID}/pages/page_05/layout`).send(geometryChange);
    expect(geometryRes.status).toBe(403);
    expect(geometryRes.body.error).toBe("forbidden");
  });
});

describe("GET /:id/layouts/export-zip", () => {
  it("404s when no lettering files exist for the volume", async () => {
    const res = await api.get(`/api/volumes/does-not-exist/layouts/export-zip`);
    expect(res.status).toBe(404);
  });

  it("returns a zip attachment once at least one page layout has been saved", async () => {
    await writeLetteringFixture(env.scanRoot);
    const res = await api.get(`/api/volumes/${VOLUME_ID}/layouts/export-zip`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });
});

describe("GET /:id/reports", () => {
  it("returns every saved, schema-valid page layout for the volume, sorted by page", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/reports`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: "page_01" })])
    );
  });

  it("respects a saved page order instead of the plain natural filename sort, and still includes an orphaned layout (no matching source image) as a trailing straggler", async () => {
    await api.post(`/api/volumes/${VOLUME_ID}/pages`).attach("pages", Buffer.from("not a real image, but pages.ts only checks the extension"), "page_02.png");
    await api.put(`/api/volumes/${VOLUME_ID}/pages/page_02/layout`).send({
      page: "page_02",
      sourceImage: "page_02.png",
      imageWidth: 4,
      imageHeight: 4,
      bubbles: [],
      images: [],
      curvedTexts: [],
      panels: [],
    });
    // An orphan: a saved layout with no matching page_orphan.png on disk at all.
    await api.put(`/api/volumes/${VOLUME_ID}/pages/page_orphan/layout`).send({
      page: "page_orphan",
      sourceImage: "page_orphan.png",
      imageWidth: 4,
      imageHeight: 4,
      bubbles: [],
      images: [],
      curvedTexts: [],
      panels: [],
    });

    await api.put(`/api/volumes/${VOLUME_ID}/pages/order`).send({ order: ["page_02", "page_01"] });

    const res = await api.get(`/api/volumes/${VOLUME_ID}/reports`);
    expect(res.status).toBe(200);
    const pages = (res.body as { page: string }[]).map((p) => p.page);
    // page_02 before page_01 per the saved order; the orphan (not in listPages() at
    // all) falls through to the natural-sort fallback and lands after every ordered
    // page, instead of being dropped from the report. Other pages/layouts written by
    // earlier tests in this file may also be present — only these three's relative
    // order is asserted.
    expect(pages.indexOf("page_02")).toBeLessThan(pages.indexOf("page_01"));
    expect(pages.indexOf("page_orphan")).toBe(pages.length - 1);
  });
});

describe("POST /:id/layouts/import-zip", () => {
  it("requires a zip file", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/layouts/import-zip`);
    expect(res.status).toBe(400);
  });

  it("rejects a non-zip upload with a clear error instead of crashing", async () => {
    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/layouts/import-zip`)
      .attach("zip", Buffer.from("not a zip"), "layouts.zip");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_zip_file");
  });

  it("imports valid entries and skips invalid ones, reporting both", async () => {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    const validLayout = {
      page: "page_02",
      sourceImage: "page_02.png",
      imageWidth: 4,
      imageHeight: 4,
      bubbles: [],
      images: [],
      curvedTexts: [],
      panels: [],
    };
    zip.addFile("page_02.json", Buffer.from(JSON.stringify(validLayout)));
    zip.addFile("page_03.json", Buffer.from("not valid json"));
    zip.addFile("page_04.json", Buffer.from(JSON.stringify({ page: "only a page field" })));

    const res = await api
      .post(`/api/volumes/${VOLUME_ID}/layouts/import-zip`)
      .attach("zip", zip.toBuffer(), "layouts.zip");
    expect(res.status).toBe(200);
    expect(res.body.imported).toEqual(["page_02.json"]);
    expect(res.body.skipped).toHaveLength(2);

    const imported = await api.get(`/api/volumes/${VOLUME_ID}/pages/page_02/layout`);
    expect(imported.body).toMatchObject({ page: "page_02" });
  });
});
