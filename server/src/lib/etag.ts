import { createHash } from "node:crypto";

/** Sentinel ETag for "no document saved yet" — lets a client's first save express
 * "I expect to be creating this document, not overwriting one" via If-Match, the same
 * way a real hash would express "I expect to be overwriting exactly this version". */
export const NEW_DOCUMENT_ETAG = '"new"';

/** Weak-ish content hash used as an HTTP ETag for the small whole-document JSON files
 * (page layouts, scripts) that get read-then-PUT-back by the editor — lets a PUT detect
 * "someone else saved this document since I last loaded it" via a standard If-Match
 * header, without adding a version field to the documents themselves. */
export function computeEtag(raw: string): string {
  return `"${createHash("sha256").update(raw).digest("hex")}"`;
}
