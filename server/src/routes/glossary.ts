import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readGlossary, writeGlossary } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { GlossaryEntrySchema } from "../../../shared/src/glossary.js";

export const glossaryRouter = Router();
const requireTranslator = requireProjectRole("translator");

// Reuses the same field list as the shared GlossaryEntry type (just without `id`, which
// the server assigns) instead of hand-duplicating it — the two used to drift independently.
const GlossaryInputSchema = GlossaryEntrySchema.omit({ id: true });

glossaryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await readGlossary(req.activeProject));
  })
);

glossaryRouter.post(
  "/",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const parsed = GlossaryInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_glossary_entry", details: parsed.error.flatten() });
      return;
    }
    const entries = await readGlossary(req.activeProject);
    const next = [...entries, { id: randomUUID(), ...parsed.data }];
    await writeGlossary(next, req.activeProject);
    res.status(201).json(next);
  })
);

glossaryRouter.put(
  "/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const parsed = GlossaryInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_glossary_entry", details: parsed.error.flatten() });
      return;
    }
    const entries = await readGlossary(req.activeProject);
    const idx = entries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "glossary_entry_not_found" });
      return;
    }
    const next = [...entries];
    next[idx] = { id: req.params.id, ...parsed.data };
    await writeGlossary(next, req.activeProject);
    res.json(next);
  })
);

glossaryRouter.delete(
  "/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const entries = await readGlossary(req.activeProject);
    const next = entries.filter((e) => e.id !== req.params.id);
    if (next.length === entries.length) {
      res.status(404).json({ error: "glossary_entry_not_found" });
      return;
    }
    await writeGlossary(next, req.activeProject);
    res.json(next);
  })
);
