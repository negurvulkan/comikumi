import type { PublishingConnector } from "./types.js";
import { getDecryptedAiMangaTokens, updateUser, findUserById } from "../authStore.js";

/** AI MANGA access tokens are short-lived (1h, per the docs) — refresh a little early
 * rather than exactly at expiry, so a publish job that takes a few minutes doesn't race
 * the token going stale mid-upload. */
const REFRESH_SKEW_MS = 60 * 1000;

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
    },
  });
  return refreshed.accessToken;
}
