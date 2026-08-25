import { z } from "zod";

/**
 * ComicInfo.xml field set — the de-facto metadata standard most CBZ readers (Komga,
 * Kavita, ComicRack, YACReader, …) understand. Collected via the client's
 * CbzMetadataModal.tsx before a CBZ download and consumed by the server's
 * `/exports/:folderSuffix/cbz` route to build the archive's ComicInfo.xml. Every field
 * is optional — an unset field is simply omitted from the XML rather than written empty.
 * PageCount is always derived server-side from the actual packaged image count, never
 * user-supplied, so it isn't part of this schema.
 */

export const CBZ_AGE_RATINGS = [
  "Unknown",
  "Adults Only 18+",
  "Early Childhood",
  "Everyone",
  "Everyone 10+",
  "G",
  "Kids to Adults",
  "M",
  "MA15+",
  "Mature 17+",
  "PG",
  "R18+",
  "Rating Pending",
  "Teen",
  "X18+",
] as const;
export const CbzAgeRatingSchema = z.enum(CBZ_AGE_RATINGS);
export type CbzAgeRating = z.infer<typeof CbzAgeRatingSchema>;

/** "Unknown" here means "let the server derive it from the project's reading
 * direction" (see export.ts) rather than an actual ComicInfo.xml value. */
export const CBZ_MANGA_VALUES = ["Unknown", "No", "Yes", "YesAndRightToLeft"] as const;
export const CbzMangaSchema = z.enum(CBZ_MANGA_VALUES);
export type CbzManga = z.infer<typeof CbzMangaSchema>;

export const CBZ_PAGE_TYPES = [
  "FrontCover",
  "InnerCover",
  "Roundup",
  "Story",
  "Advertisement",
  "Editorial",
  "Letters",
  "Preview",
  "BackCover",
  "Other",
  "Deleted",
] as const;
export const CbzPageTypeSchema = z.enum(CBZ_PAGE_TYPES);
export type CbzPageType = z.infer<typeof CbzPageTypeSchema>;

export const CbzPageEntrySchema = z.object({
  /** 0-based index into the archive's actual (already filtered/reordered) image
   * sequence — assigned by the client from the same ordering the server will produce,
   * see ExportViewer.tsx's orderedExportedPages. */
  image: z.number().int().nonnegative(),
  type: CbzPageTypeSchema.optional(),
  doublePage: z.boolean().optional(),
});
export type CbzPageEntry = z.infer<typeof CbzPageEntrySchema>;

const optionalTrimmed = (max: number) => z.string().trim().max(max).optional();

export const CbzMetadataSchema = z.object({
  // Base & series information
  title: optionalTrimmed(200),
  series: optionalTrimmed(200),
  number: optionalTrimmed(20),
  volume: optionalTrimmed(20),
  summary: optionalTrimmed(4000),
  notes: optionalTrimmed(4000),

  // Credits
  writer: optionalTrimmed(300),
  penciller: optionalTrimmed(300),
  inker: optionalTrimmed(300),
  colorist: optionalTrimmed(300),
  letterer: optionalTrimmed(300),
  coverArtist: optionalTrimmed(300),
  editor: optionalTrimmed(300),
  translator: optionalTrimmed(300),

  // Publication & metrics
  publisher: optionalTrimmed(200),
  imprint: optionalTrimmed(200),
  year: optionalTrimmed(4),
  month: optionalTrimmed(2),
  day: optionalTrimmed(2),
  web: optionalTrimmed(500),
  languageIso: optionalTrimmed(10),

  // Categorization & audience
  genre: optionalTrimmed(300),
  tags: optionalTrimmed(300),
  ageRating: CbzAgeRatingSchema.optional(),
  manga: CbzMangaSchema.optional(),
  format: optionalTrimmed(100),
  scanInformation: optionalTrimmed(300),

  pages: z.array(CbzPageEntrySchema).optional(),
});
export type CbzMetadata = z.infer<typeof CbzMetadataSchema>;
