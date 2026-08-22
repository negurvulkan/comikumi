import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readGlossary, writeGlossary } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";

export const glossaryRouter = Router();
const requireTranslator = requireProjectRole("translator");

const GlossaryInputSchema = z.object({
  term: z.string().trim().min(1).max(60),
  translations: z.record(z.string(), z.string()).default({}),
  note: z.string().default(""),
});

glossaryRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await readGlossary());
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
    const entries = await readGlossary();
    const next = [...entries, { id: randomUUID(), ...parsed.data }];
    await writeGlossary(next);
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
    const entries = await readGlossary();
    const idx = entries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "glossary_entry_not_found" });
      return;
    }
    const next = [...entries];
    next[idx] = { id: req.params.id, ...parsed.data };
    await writeGlossary(next);
    res.json(next);
  })
);

glossaryRouter.delete(
  "/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const entries = await readGlossary();
    const next = entries.filter((e) => e.id !== req.params.id);
    if (next.length === entries.length) {
      res.status(404).json({ error: "glossary_entry_not_found" });
      return;
    }
    await writeGlossary(next);
    res.json(next);
  })
);
