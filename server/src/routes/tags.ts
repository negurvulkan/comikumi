import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readTags, writeTags } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";
import { TagSchema } from "../../../shared/src/tags.js";

export const tagsRouter = Router();
// Tag definitions are editorial classification metadata (like the glossary/characters),
// so managing the list is a translator-level concern. Assigning a tag to a bubble is a
// layout change and therefore goes through the normal letterer-gated layout save.
const requireTranslator = requireProjectRole("translator");

// Same field list as the shared Tag type minus `id` (assigned server-side), rather than
// hand-duplicating it — same approach as glossary.ts/characters.ts.
const TagInputSchema = TagSchema.omit({ id: true });

tagsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await readTags(req.activeProject));
  })
);

tagsRouter.post(
  "/",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const parsed = TagInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_tag", details: parsed.error.flatten() });
      return;
    }
    const tags = await readTags(req.activeProject);
    const next = [...tags, { id: randomUUID(), ...parsed.data }];
    await writeTags(next, req.activeProject);
    res.status(201).json(next);
  })
);

tagsRouter.put(
  "/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const parsed = TagInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_tag", details: parsed.error.flatten() });
      return;
    }
    const tags = await readTags(req.activeProject);
    const idx = tags.findIndex((tTag) => tTag.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "tag_not_found" });
      return;
    }
    const next = [...tags];
    next[idx] = { id: req.params.id, ...parsed.data };
    await writeTags(next, req.activeProject);
    res.json(next);
  })
);

tagsRouter.delete(
  "/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const tags = await readTags(req.activeProject);
    const next = tags.filter((tTag) => tTag.id !== req.params.id);
    if (next.length === tags.length) {
      res.status(404).json({ error: "tag_not_found" });
      return;
    }
    await writeTags(next, req.activeProject);
    res.json(next);
  })
);
