import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { PageOrderDocumentSchema } from "../../../shared/src/pageOrder.js";
import { findVolume, listPages, pageOrderFilePathFor } from "../lib/projectScanner.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { computeEtag, NEW_DOCUMENT_ETAG } from "../lib/etag.js";
import { withFileLock } from "../lib/fileLock.js";

export const pageOrderRouter = Router();

/** Read/write the volume's saved page-display-order document — same ETag/If-Match/
 * withFileLock pattern as script.ts's GET/PUT .../script, except the GET fallback for
 * "no document saved yet" returns the *derived* natural order (via listPages(), which
 * itself falls back to a plain natural sort when no order file exists) rather than an
 * empty array: an empty order array would be actively wrong here (it would mean "no
 * pages"), whereas the derived order is always a complete, immediately usable array
 * that matches what the page grid already shows. */
pageOrderRouter.get(
  "/:id/pages/order",
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    try {
      const raw = await fs.readFile(pageOrderFilePathFor(volume), "utf-8");
      res.setHeader("ETag", computeEtag(raw));
      res.json(PageOrderDocumentSchema.parse(JSON.parse(raw)));
    } catch {
      const pages = await listPages(volume);
      res.setHeader("ETag", NEW_DOCUMENT_ETAG);
      res.json({ order: pages.map((p) => p.page) });
    }
  })
);

pageOrderRouter.put(
  "/:id/pages/order",
  requireProjectRole("letterer"),
  asyncHandler(async (req, res) => {
    const volume = await findVolume(req.params.id, req.activeProject);
    if (!volume) {
      res.status(404).json({ error: "volume_not_found" });
      return;
    }
    const parsed = PageOrderDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_page_order", details: parsed.error.flatten() });
      return;
    }
    const ifMatch = req.header("If-Match");
    const file = pageOrderFilePathFor(volume);

    await withFileLock(file, async () => {
      let currentRaw: string | null = null;
      try {
        currentRaw = await fs.readFile(file, "utf-8");
      } catch {
        // No order document saved yet.
      }
      const currentEtag = currentRaw ? computeEtag(currentRaw) : NEW_DOCUMENT_ETAG;
      if (ifMatch && ifMatch !== currentEtag) {
        const currentOrder = currentRaw ? PageOrderDocumentSchema.parse(JSON.parse(currentRaw)).order : (await listPages(volume)).map((p) => p.page);
        res.status(409).json({ error: "page_order_conflict", currentOrder });
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
