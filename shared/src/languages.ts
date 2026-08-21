import { z } from "zod";

// Folder suffix becomes part of a real directory name (e.g. "volume_01_french"),
// so keep it restricted to safe filesystem characters.
const FOLDER_SUFFIX_RE = /^[a-zA-Z0-9_-]+$/;

export const LanguageDefSchema = z.object({
  /** Short code used as map key in Bubble.text, e.g. "de" */
  code: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[a-zA-Z0-9_-]+$/, "Nur Buchstaben, Zahlen, - und _ erlaubt"),
  /** Human readable label for UI tabs */
  label: z.string().trim().min(1).max(40),
  /** Folder suffix used in the existing production convention, e.g. "german" -> volume_01_german */
  folderSuffix: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(FOLDER_SUFFIX_RE, "Nur Buchstaben, Zahlen, - und _ erlaubt"),
});
export type LanguageDef = z.infer<typeof LanguageDefSchema>;

export const LanguageListSchema = z.array(LanguageDefSchema);

export const DEFAULT_LANGUAGES: LanguageDef[] = [
  { code: "de", label: "Deutsch", folderSuffix: "german" },
  { code: "en", label: "English", folderSuffix: "english" },
  { code: "jp", label: "日本語", folderSuffix: "japanese" },
];
