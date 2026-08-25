import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { setupTestEnv, authedAgent, type TestEnv } from "../test-utils/fixtures.js";

const sendMailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/mailer.js", () => ({
  sendMail: (...args: unknown[]) => sendMailMock(...args),
  commentDeepLink: () => "https://example.com/#/volumes/Volume_01/pages/page_01?comment=fake",
}));

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

beforeEach(() => {
  sendMailMock.mockClear();
});

const VOLUME_ID = "Volume_01";

const PIN_TARGET = { kind: "pin", point: { x: 10, y: 20 } };

describe("GET /:id/comments", () => {
  it("returns an empty document when nothing was saved yet", async () => {
    const res = await api.get(`/api/volumes/${VOLUME_ID}/comments`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ comments: [] });
  });

  it("404s for an unknown volume", async () => {
    const res = await api.get(`/api/volumes/does-not-exist/comments`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("volume_not_found");
  });
});

describe("POST /:id/comments", () => {
  it("rejects a body that doesn't match the comment schema", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({ page: "page_01" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_comment");
  });

  it("creates a comment, sets id/authorId/createdAt server-side, and it's readable back afterward", async () => {
    const create = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({
      page: "page_01",
      target: PIN_TARGET,
      body: "Sprechblase überlappt den Kopf",
      mentionedUserIds: [],
      mentionedRoles: ["letterer"],
    });
    expect(create.status).toBe(201);
    expect(create.body.id).toBeTypeOf("string");
    expect(create.body.authorId).toBe(env.userId);
    expect(create.body.createdAt).toBeTypeOf("string");
    expect(create.body.target).toEqual(PIN_TARGET);
    expect(create.body.mentionedRoles).toEqual(["letterer"]);
    expect(create.body.replies).toEqual([]);

    const list = await api.get(`/api/volumes/${VOLUME_ID}/comments`);
    expect(list.body.comments).toHaveLength(1);
    expect(list.body.comments[0].id).toBe(create.body.id);
  });

  it("?page= filters the returned comments to one page", async () => {
    await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({ page: "page_02", target: { kind: "page" }, body: "Allgemeine Anmerkung" });
    const filtered = await api.get(`/api/volumes/${VOLUME_ID}/comments?page=page_02`);
    expect(filtered.body.comments.every((c: { page: string }) => c.page === "page_02")).toBe(true);
    expect(filtered.body.comments.length).toBeGreaterThan(0);
  });

  it("regression: concurrent posts to the same volume never lose one reviewer's comment to another's (see fileLock.ts)", async () => {
    const before = await api.get(`/api/volumes/${VOLUME_ID}/comments`);
    const beforeCount = before.body.comments.length;

    const bodies = ["Concurrent A", "Concurrent B", "Concurrent C", "Concurrent D", "Concurrent E"];
    const results = await Promise.all(
      bodies.map((body) => api.post(`/api/volumes/${VOLUME_ID}/comments`).send({ page: "page_04", target: { kind: "page" }, body }))
    );
    expect(results.every((r) => r.status === 201)).toBe(true);

    const after = await api.get(`/api/volumes/${VOLUME_ID}/comments`);
    expect(after.body.comments.length).toBe(beforeCount + bodies.length);
    const savedBodies = after.body.comments.map((c: { body: string }) => c.body);
    for (const body of bodies) expect(savedBodies).toContain(body);
  });
});

describe("POST /:id/comments/:commentId/replies", () => {
  it("404s for an unknown comment", async () => {
    const res = await api.post(`/api/volumes/${VOLUME_ID}/comments/does-not-exist/replies`).send({ body: "..." });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("comment_not_found");
  });

  it("appends a reply and it's visible in the comment's replies", async () => {
    const create = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({ page: "page_03", target: { kind: "page" }, body: "Original" });
    const reply = await api
      .post(`/api/volumes/${VOLUME_ID}/comments/${create.body.id}/replies`)
      .send({ body: "Behoben in Rev 2", mentionedUserIds: [env.userId] });
    expect(reply.status).toBe(201);
    expect(reply.body.replies).toHaveLength(1);
    expect(reply.body.replies[0].body).toBe("Behoben in Rev 2");
    expect(reply.body.replies[0].mentionedUserIds).toEqual([env.userId]);
  });
});

describe("PATCH /:id/comments/:commentId", () => {
  it("toggles resolved and rejects any other field", async () => {
    const create = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({ page: "page_04", target: { kind: "page" }, body: "..." });

    const resolve = await api.patch(`/api/volumes/${VOLUME_ID}/comments/${create.body.id}`).send({ resolved: true });
    expect(resolve.status).toBe(200);
    expect(resolve.body.resolved).toBe(true);

    const reopen = await api.patch(`/api/volumes/${VOLUME_ID}/comments/${create.body.id}`).send({ resolved: false });
    expect(reopen.status).toBe(200);
    expect(reopen.body.resolved).toBeUndefined(); // false is stored as absent, same convention as Bubble.locked

    const invalid = await api.patch(`/api/volumes/${VOLUME_ID}/comments/${create.body.id}`).send({ body: "sneaky rewrite" });
    expect(invalid.status).toBe(400);
  });
});

describe("GET /:id/comments/mentionable-members", () => {
  it("lists project members as {userId, username} without roles", async () => {
    // The system-admin `api` user has implicit bypass access but isn't necessarily
    // listed in `members` itself — add an explicit member to assert against.
    const { createUser } = await import("../lib/authStore.js");
    const mentionable = await createUser("mentionable-user", "pw", false);
    const addMember = await api.post("/api/project/members").send({ username: "mentionable-user", role: "letterer" });
    expect(addMember.status).toBe(201);

    const res = await api.get(`/api/volumes/${VOLUME_ID}/comments/mentionable-members`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([{ userId: mentionable.id, username: "mentionable-user" }]));
    expect(res.body[0]).not.toHaveProperty("role");
  });
});

describe("DELETE /:id/comments/:commentId — permissions", () => {
  it("lets any project member (viewer and up) create/read comments, but only the author or a project admin may delete", async () => {
    const { createUser } = await import("../lib/authStore.js");
    await createUser("viewer-user", "pw", false);
    const login = await api.post("/api/auth/login").send({ username: "viewer-user", password: "pw" });
    const viewerToken = login.body.token as string;
    const addMember = await api.post("/api/project/members").send({ username: "viewer-user", role: "viewer" });
    expect(addMember.status).toBe(201);
    const viewerApi = authedAgent(app, viewerToken);

    // Viewer (lowest role) can create a comment despite not being able to touch layout geometry.
    const ownComment = await viewerApi
      .post(`/api/volumes/${VOLUME_ID}/comments`)
      .send({ page: "page_06", target: { kind: "page" }, body: "Viewer-Kommentar" });
    expect(ownComment.status).toBe(201);

    // Viewer can delete their own comment.
    const deleteOwn = await viewerApi.delete(`/api/volumes/${VOLUME_ID}/comments/${ownComment.body.id}`);
    expect(deleteOwn.status).toBe(200);

    // Viewer cannot delete a comment authored by the (system-admin) `api` user.
    const adminComment = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({ page: "page_06", target: { kind: "page" }, body: "Admin-Kommentar" });
    const deleteForbidden = await viewerApi.delete(`/api/volumes/${VOLUME_ID}/comments/${adminComment.body.id}`);
    expect(deleteForbidden.status).toBe(403);

    // The system-admin `api` user can delete anyone's comment.
    const deleteAsAdmin = await api.delete(`/api/volumes/${VOLUME_ID}/comments/${adminComment.body.id}`);
    expect(deleteAsAdmin.status).toBe(200);
  });

  it("404s deleting an unknown comment", async () => {
    const res = await api.delete(`/api/volumes/${VOLUME_ID}/comments/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("comment_not_found");
  });
});

describe("mention notifications (Phase C)", () => {
  it("emails a directly-mentioned user who has an email set, but not one who doesn't", async () => {
    const { createUser } = await import("../lib/authStore.js");
    const withEmail = await createUser("mentioned-with-email", "pw", false);
    const withoutEmail = await createUser("mentioned-without-email", "pw", false);
    await api.post("/api/project/members").send({ username: "mentioned-with-email", role: "letterer" });
    await api.post("/api/project/members").send({ username: "mentioned-without-email", role: "letterer" });
    const setEmail = await api.patch(`/api/auth/users/${withEmail.id}`).send({ email: "mentioned@example.com" });
    expect(setEmail.status).toBe(200);

    const create = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({
      page: "page_07",
      target: { kind: "page" },
      body: "Bitte prüfen",
      mentionedUserIds: [withEmail.id, withoutEmail.id],
    });
    expect(create.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50)); // notifyMentions runs fire-and-forget, not awaited by the response
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "mentioned@example.com", text: expect.stringContaining("Bitte prüfen") })
    );
  });

  it("emails every CURRENT member of a mentioned role, resolved at send time", async () => {
    const { createUser } = await import("../lib/authStore.js");
    const letterer1 = await createUser("letterer-one", "pw", false);
    const letterer2 = await createUser("letterer-two", "pw", false);
    await api.post("/api/project/members").send({ username: "letterer-one", role: "letterer" });
    await api.post("/api/project/members").send({ username: "letterer-two", role: "letterer" });
    await api.patch(`/api/auth/users/${letterer1.id}`).send({ email: "letterer1@example.com" });
    await api.patch(`/api/auth/users/${letterer2.id}`).send({ email: "letterer2@example.com" });

    const create = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({
      page: "page_08",
      target: { kind: "page" },
      body: "An das Lettering-Team",
      mentionedRoles: ["letterer"],
    });
    expect(create.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));
    const recipients = sendMailMock.mock.calls.map((call) => (call[0] as { to: string }).to);
    expect(recipients).toEqual(expect.arrayContaining(["letterer1@example.com", "letterer2@example.com"]));
  });

  it("never emails the comment's own author, even if they mention their own role", async () => {
    // Give the system-admin `api` user (this comment's author) an explicit "admin"
    // membership + email, so mentioning "admin" would otherwise match them too.
    await api.post("/api/project/members").send({ username: "test-admin", role: "admin" });
    await api.patch(`/api/auth/users/${env.userId}`).send({ email: "self@example.com" });

    const otherAdmin = await (await import("../lib/authStore.js")).createUser("other-admin", "pw", false);
    await api.post("/api/project/members").send({ username: "other-admin", role: "admin" });
    await api.patch(`/api/auth/users/${otherAdmin.id}`).send({ email: "other-admin@example.com" });

    const create = await api.post(`/api/volumes/${VOLUME_ID}/comments`).send({
      page: "page_09",
      target: { kind: "page" },
      body: "Selbstgespräch",
      mentionedRoles: ["admin"],
    });
    expect(create.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));
    const recipients = sendMailMock.mock.calls.map((call) => (call[0] as { to: string }).to);
    expect(recipients).toContain("other-admin@example.com"); // a different admin does get notified
    expect(recipients).not.toContain("self@example.com"); // the author themselves never does
  });
});
