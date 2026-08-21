import type { TFunction } from "i18next";
import { ApiError } from "../api/client";

/** Turns a caught API/network error into a message in the current UI locale.
 * ApiError.code is looked up under `errors.*` (see locales/*.json) — i18next
 * returns the bare key itself when a code has no translation yet, which is a safe
 * fallback rather than a crash for any code this hasn't caught up with yet. */
export function translateApiError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) return t(`errors.${err.code}`, err.params);
  if (err instanceof Error) return err.message;
  return String(err);
}
