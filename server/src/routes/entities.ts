import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readEntities, writeEntities, readEntityRelations, writeEntityRelations } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";

export const entitiesRouter = Router();
// Story-bible content is editorial/narrative work, not lettering production — same
// minimum role as glossary.ts, not characters.ts's "letterer" (characters.ts gates on
// letterer because it doubles as production-facing bubble-tagging metadata).
const requireTranslator = requireProjectRole("translator");

const EntityInputSchema = z.object({
  type: z.string().trim().min(1).max(40).default("character"),
  name: z.string().trim().min(1).max(80),
  color: z.string().default("#6c8cff"),
  summary: z.string().max(200).default(""),
  notes: z.string().default(""),
});

const EntityRelationInputSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  label: z.string().trim().min(1).max(60),
});

entitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await readEntities(req.activeProject));
  })
);

entitiesRouter.post(
  "/",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const parsed = EntityInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_entity", details: parsed.error.flatten() });
      return;
    }
    const entities = await readEntities(req.activeProject);
    const next = [...entities, { id: randomUUID(), ...parsed.data }];
    await writeEntities(next, req.activeProject);
    res.status(201).json(next);
  })
);

entitiesRouter.put(
  "/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const parsed = EntityInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_entity", details: parsed.error.flatten() });
      return;
    }
    const entities = await readEntities(req.activeProject);
    const idx = entities.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "entity_not_found" });
      return;
    }
    const next = [...entities];
    next[idx] = { id: req.params.id, ...parsed.data };
    await writeEntities(next, req.activeProject);
    res.json(next);
  })
);

entitiesRouter.delete(
  "/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const entities = await readEntities(req.activeProject);
    const next = entities.filter((e) => e.id !== req.params.id);
    if (next.length === entities.length) {
      res.status(404).json({ error: "entity_not_found" });
      return;
    }
    await writeEntities(next, req.activeProject);
    // Cascade: drop any relation dangling from the just-deleted entity — cheap since
    // this list is small and lives in the same project file, unlike Bubble.characterId
    // which tolerates staleness because cleaning it would mean scanning every page.
    const relations = await readEntityRelations(req.activeProject);
    const nextRelations = relations.filter((r) => r.fromId !== req.params.id && r.toId !== req.params.id);
    if (nextRelations.length !== relations.length) {
      await writeEntityRelations(nextRelations, req.activeProject);
    }
    res.json(next);
  })
);

entitiesRouter.get(
  "/relations",
  asyncHandler(async (req, res) => {
    res.json(await readEntityRelations(req.activeProject));
  })
);

entitiesRouter.post(
  "/relations",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const parsed = EntityRelationInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_relation", details: parsed.error.flatten() });
      return;
    }
    const relations = await readEntityRelations(req.activeProject);
    const next = [...relations, { id: randomUUID(), ...parsed.data }];
    await writeEntityRelations(next, req.activeProject);
    res.status(201).json(next);
  })
);

entitiesRouter.delete(
  "/relations/:id",
  requireTranslator,
  asyncHandler(async (req, res) => {
    const relations = await readEntityRelations(req.activeProject);
    const next = relations.filter((r) => r.id !== req.params.id);
    if (next.length === relations.length) {
      res.status(404).json({ error: "relation_not_found" });
      return;
    }
    await writeEntityRelations(next, req.activeProject);
    res.json(next);
  })
);
