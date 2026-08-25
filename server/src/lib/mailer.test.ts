import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn().mockResolvedValue({ messageId: "test" });
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
}));

import { sendMail, commentDeepLink, resetMailerForTests } from "./mailer.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SMTP_HOST;
  delete process.env.APP_BASE_URL;
  resetMailerForTests();
});

describe("sendMail", () => {
  it("no-ops (never touches nodemailer) when SMTP_HOST isn't configured", async () => {
    await sendMail({ to: "a@b.com", subject: "Hi", text: "Body" });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("builds a transport from env vars and sends once SMTP_HOST is set", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_FROM = "ComiKumi <noreply@example.com>";

    await sendMail({ to: "a@b.com", subject: "Hi", text: "Body" });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.com", port: 2525 }));
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "ComiKumi <noreply@example.com>",
      to: "a@b.com",
      subject: "Hi",
      text: "Body",
    });
  });

  it("reuses the same transport across multiple sends (built once, not per call)", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    await sendMail({ to: "a@b.com", subject: "1", text: "..." });
    await sendMail({ to: "c@d.com", subject: "2", text: "..." });
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it("swallows a send failure without throwing — a broken SMTP config must never break the caller", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    sendMailMock.mockRejectedValueOnce(new Error("connection refused"));
    await expect(sendMail({ to: "a@b.com", subject: "Hi", text: "Body" })).resolves.toBeUndefined();
  });
});

describe("commentDeepLink", () => {
  it("returns null when APP_BASE_URL isn't configured", () => {
    expect(commentDeepLink("Volume_01", "page_01", "comment-1")).toBeNull();
  });

  it("builds a hash-router deep link, trimming a trailing slash on APP_BASE_URL", () => {
    process.env.APP_BASE_URL = "https://comi-test.example.com/";
    expect(commentDeepLink("Volume_01", "page_01", "comment-1")).toBe(
      "https://comi-test.example.com/#/volumes/Volume_01/pages/page_01?comment=comment-1"
    );
  });
});
