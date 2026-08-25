import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readCharacters, writeCharacters } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";

export const charactersRouter = Router();
const requireLetterer = requireProjectRole("letterer");

const CharacterInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().default("#6c8cff"),
  voiceNotes: z.string().default(""),
});

charactersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await readCharacters(req.activeProject));
  })
);

charactersRouter.post(
  "/",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const parsed = CharacterInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_character", details: parsed.error.flatten() });
      return;
    }
    const characters = await readCharacters(req.activeProject);
    const next = [...characters, { id: randomUUID(), ...parsed.data }];
    await writeCharacters(next, req.activeProject);
    res.status(201).json(next);
  })
);

charactersRouter.put(
  "/:id",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const parsed = CharacterInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_character", details: parsed.error.flatten() });
      return;
    }
    const characters = await readCharacters(req.activeProject);
    const idx = characters.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "character_not_found" });
      return;
    }
    const next = [...characters];
    next[idx] = { id: req.params.id, ...parsed.data };
    await writeCharacters(next, req.activeProject);
    res.json(next);
  })
);

charactersRouter.delete(
  "/:id",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const characters = await readCharacters(req.activeProject);
    const next = characters.filter((c) => c.id !== req.params.id);
    if (next.length === characters.length) {
      res.status(404).json({ error: "character_not_found" });
      return;
    }
    await writeCharacters(next, req.activeProject);
    res.json(next);
  })
);
