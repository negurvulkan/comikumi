import type { PublishingConnector } from "./types.js";
import { getDecryptedAiMangaTokens, updateUser, findUserById } from "../authStore.js";
import { PUBLISH_JOB_POLL_TIMEOUT_MS } from "../publishJobs.js";

/** AI MANGA access tokens are short-lived (1h, per the docs) — refresh well before
 * expiry, not just-in-time, because a publish job (publishJobs.ts) can keep polling for
 * up to PUBLISH_JOB_POLL_TIMEOUT_MS after this token was minted for the initial publish
 * call. A token that had, say, 2 minutes left when getValidAccessToken() was called for
 * publish() would previously NOT have been refreshed (skew was only 60s) and could then
 * expire mid-poll. The skew must exceed the poll timeout with real margin. */
const REFRESH_SKEW_MS = PUBLISH_JOB_POLL_TIMEOUT_MS + 5 * 60 * 1000;

/** Returns a currently-valid access token for the given connector + user, refreshing
 * and re-persisting it first if the stored one is expired (or about to be) — the only
 * place in this codebase that decides whether a stored OAuth token needs refreshing.
 * Returns null if the user has never connected this connector at all. */
export async function getValidAccessToken(connector: PublishingConnector, userId: string): Promise<string | null> {
  if (connector.id !== "ai-manga") return null; // only connector wired up so far
  const tokens = await getDecryptedAiMangaTokens(userId);
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt - REFRESH_SKEW_MS) return tokens.accessToken;

  const refreshed = await connector.refreshTokens(tokens.refreshToken);
  const user = await findUserById(userId);
  await updateUser(userId, {
    aiMangaConnection: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      accountLabel: user?.aiMangaConnection?.accountLabel ?? "",
      accountId: user?.aiMangaConnection?.accountId ?? "",
    },
  });
  return refreshed.accessToken;
}
