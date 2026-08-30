import { api, type VolumeSummary } from "../api/client";

export interface IndexedBubble {
  volumeId: string;
  /** Human-readable volume name — `bookFolderName` is the closest thing VolumeSummary
   * has to a display label (there's no separate free-text "title" field on a volume). */
  volumeLabel: string;
  page: string;
  bubbleId: string;
  /** Same shape as Bubble.text — one entry per language this bubble has text in. */
  text: Record<string, string>;
}

/**
 * Project-wide "search index" — flattens every bubble across every volume into one
 * array, built from `api.listVolumes()` + `api.getVolumeReport()` per volume (both
 * already exist; this is the first caller that combines them across the WHOLE
 * project instead of one volume at a time). Genuinely new territory: the existing
 * `/reports` route (used by VolumeReportModal.tsx and QaCheckModal.tsx) only ever
 * scans one volume, sequentially, per request.
 *
 * Deliberately request-scoped, not cached across calls — every call re-fetches fresh
 * data. A persisted cross-request cache was considered (see TODO.md) but skipped: the
 * project's page-JSON files can change between one Find&Replace/Translation-Memory use
 * and the next (another editor session saving), and staleness bugs in a search-and-
 * REPLACE feature are worse than the cost of a fresh scan. The volume-level reports are
 * fetched in parallel (Promise.all) rather than the sequential loop the existing
 * `/reports` route uses server-side, which is the actual "index vs. scan" win here —
 * one shared, parallelized implementation instead of duplicating the scan per feature.
 */
export async function buildProjectSearchIndex(volumes?: VolumeSummary[]): Promise<IndexedBubble[]> {
  const resolvedVolumes = volumes ?? (await api.listVolumes());
  const perVolume = await Promise.all(
    resolvedVolumes.map(async (volume) => {
      const rows = await api.getVolumeReport(volume.id);
      return rows.flatMap((row) =>
        row.layout.bubbles.map(
          (bubble): IndexedBubble => ({
            volumeId: volume.id,
            volumeLabel: volume.bookFolderName,
            page: row.page,
            bubbleId: bubble.id,
            text: bubble.text,
          })
        )
      );
    })
  );
  return perVolume.flat();
}
