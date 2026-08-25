import nodemailer, { type Transporter } from "nodemailer";

/**
 * Thin wrapper around nodemailer, configured entirely from environment variables —
 * matches this app's "no required configuration" philosophy (see server/src/index.ts's
 * optional PORT, docs/deploy-runbook.md's broker env-var pattern): if SMTP_HOST isn't
 * set, sendMail() just logs and no-ops instead of throwing, so @-mention notifications
 * degrade gracefully to "in-app only" rather than blocking comment creation or breaking
 * local dev/tests that never configure SMTP at all.
 *
 * SMTP_HOST=
 * SMTP_PORT=587
 * SMTP_SECURE=false
 * SMTP_USER=
 * SMTP_PASS=
 * SMTP_FROM="ComiKumi <noreply@example.com>"
 * APP_BASE_URL=https://comi-test.example.com   (for deep links in the mail body)
 */

let cachedTransporter: Transporter | null | undefined; // undefined = not built yet, null = unconfigured

function buildTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/** Lazily built once per process, not once per mail — reused across calls. Exported for
 * mailer.test.ts to inject a mock without needing a real SMTP_HOST env var set. */
export function resetMailerForTests(): void {
  cachedTransporter = undefined;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Fire-and-forget from the caller's perspective — comments.ts awaits this itself (to
 * keep the log message attached to the right request), but never lets a failure here
 * affect the actual comment/reply write, which has already succeeded by the time this
 * runs. A missing SMTP_HOST is not an error, just a no-op — see this module's doc
 * comment above.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (cachedTransporter === undefined) cachedTransporter = buildTransporter();
  if (!cachedTransporter) {
    console.warn(`[mailer] SMTP_HOST not configured — skipping email to ${message.to}: ${message.subject}`);
    return;
  }
  try {
    await cachedTransporter.sendMail({
      from: process.env.SMTP_FROM ?? "ComiKumi <noreply@localhost>",
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${message.to}:`, err);
  }
}

/** Deep link back into the editor at a specific comment — used in mention-notification
 * mail bodies. Returns null if APP_BASE_URL isn't configured (mail still sends, just
 * without a clickable link, same "degrade gracefully" spirit as the SMTP config itself). */
export function commentDeepLink(volumeId: string, page: string, commentId: string): string | null {
  const base = process.env.APP_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/#/volumes/${encodeURIComponent(volumeId)}/pages/${encodeURIComponent(page)}?comment=${encodeURIComponent(commentId)}`;
}
