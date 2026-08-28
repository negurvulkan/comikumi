import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { EMPTY_PAGE_META_DOCUMENT, PageMetaDocumentSchema } from "../../../shared/src/pageMeta.js";
import { findVolume, pageMetaFilePathFor } from "../lib/projectScanner.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { computeEtag, NEW_DOCUMENT_ETAG } from "../lib/etag.js";
import { withFileLock } from "../lib/fileLock.js";

export const pageMetaRouter = Router();

/** Read/write the volume's saved page-tagging (type + chapter) document — same ETag/
 * If-Match/withFileLock pattern as pageOrder.ts's GET/PUT .../order, except the GET
 * fallback for "no document saved yet" returns EMPTY_PAGE_META_DOCUMENT rather than a
 * derived value: unlike page order, there's no meaningful "natural" tagging to fall
 * back to — an untagged page is simply treated as a story page everywhere this is read. */
pageMetaRouter.get(
  "/:id/pages/meta",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    try {
      const raw = await fs.readFile(pageMetaFilePathFor(volume), "utf-8");
      res.setHeader("ETag", computeEtag(raw));
      res.json(PageMetaDocumentSchema.parse(JSON.parse(raw)));
    } catch {
      res.setHeader("ETag", NEW_DOCUMENT_ETAG);
      res.json(EMPTY_PAGE_META_DOCUMENT);
    }
  })
);

pageMetaRouter.put(
  "/:id/pages/meta",
  requireProjectRole("letterer"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = PageMetaDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_page_meta", details: parsed.error.flatten() });
      return;
    }
    const ifMatch = req.header("If-Match");
    const file = pageMetaFilePathFor(volume);

    await withFileLock(file, async () => {
      let currentRaw: string | null = null;
      try {
        currentRaw = await fs.readFile(file, "utf-8");
      } catch {
        // No meta document saved yet.
      }
      const currentEtag = currentRaw ? computeEtag(currentRaw) : NEW_DOCUMENT_ETAG;
      if (ifMatch && ifMatch !== currentEtag) {
        const current = currentRaw ? PageMetaDocumentSchema.parse(JSON.parse(currentRaw)) : EMPTY_PAGE_META_DOCUMENT;
        res.status(409).json({ error: "page_meta_conflict", current });
        return;
      }

      await fs.mkdir(path.dirname(file), { recursive: true });
      const nextRaw = JSON.stringify(parsed.data, null, 2);
      await fs.writeFile(file, nextRaw, "utf-8");
      res.setHeader("ETag", computeEtag(nextRaw));
      res.json({ ok: true });
    });
  })
);
