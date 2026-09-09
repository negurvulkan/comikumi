import type { ConnectorId } from "../../../../shared/src/connectors.js";

/**
 * Common surface every connector implements, regardless of category — kept
 * deliberately minimal (see server/src/lib/ai/types.ts's own doc comment on the same
 * "don't force one interface onto very different capabilities" reasoning). A second
 * connector category (e.g. an importer) would get its own extended interface below,
 * the same way PublishingConnector extends this one, not a bigger shared interface.
 */
export interface Connector {
  id: ConnectorId;
  /** Whether this deployment has the env vars needed to use this connector at all
   * (e.g. AI_MANGA_CLIENT_ID) — independent of any one user's connection state. The
   * client hides the connector entirely when this is false, see routes/connectors.ts. */
  isConfigured(): boolean;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

/**
 * A connector that authenticates via OAuth 2.0 Authorization Code + PKCE on behalf of
 * one ComiKumi user account — see aiMangaConnector.ts's doc comment for why this is
 * always PKCE (public client), never a client secret, regardless of deployment mode.
 */
export interface OAuthConnector extends Connector {
  /** Builds the provider's consent-screen URL plus the PKCE code verifier the caller
   * must hold onto (server-side, see oauthStateStore.ts) until the callback arrives. */
  buildAuthorizeUrl(params: { redirectUri: string; state: string; codeChallenge: string }): string;
  exchangeCodeForTokens(params: { code: string; redirectUri: string; codeVerifier: string }): Promise<OAuthTokenSet>;
  refreshTokens(refreshToken: string): Promise<OAuthTokenSet>;
  /** A short, human-readable identifier for the connected account (never an email —
   * see AI MANGA's own "cannot read a creator's email address" permission boundary),
   * shown in the Connectors settings card instead of a bare "Connected". */
  fetchAccountLabel(accessToken: string): Promise<string>;
}

export interface PublishManifestChapter {
  externalId: string;
  number: number;
  title: string;
  /** Rendered page images, in reading order — file name inside the chapter's zip
   * folder is derived from the array index (see aiMangaConnector.ts's buildZip()). */
  pages: Buffer[];
  published: boolean;
  accessMode: "free" | "paid";
}

export interface PublishManifestInput {
  seriesExternalId: string;
  seriesTitle: string;
  sourceLanguage: string;
  synopsis: string;
  genres: string[];
  /** Rendered cover image, or null to let AI MANGA fall back to the first chapter's
   * first page (see the manifest contract's own doc comment in the plan). */
  cover: Buffer | null;
  chapter: PublishManifestChapter;
}

export interface PublishResult {
  /** The connector's own import/job id — used to poll status afterward. */
  importId: string;
}

export type PublishStatusState = "pending" | "validating" | "published" | "failed";

export interface PublishStatus {
  state: PublishStatusState;
  /** Set once `state` is "published". */
  publicUrl?: string;
  /** Set once `state` is "failed". */
  error?: string;
}

/**
 * A connector that can turn a ComiKumi chapter into a published work on some external
 * platform. `publish`/`pollStatus` both take the already-decrypted access token — the
 * route layer (routes/connectorPublish.ts) is responsible for token refresh before
 * calling either, this interface has no notion of "whose account" it's acting as.
 */
export interface PublishingConnector extends OAuthConnector {
  publish(accessToken: string, input: PublishManifestInput): Promise<PublishResult>;
  pollStatus(accessToken: string, importId: string): Promise<PublishStatus>;
}
