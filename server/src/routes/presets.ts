import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PresetTextFieldsSchema, PresetBackgroundFieldsSchema } from "../../../shared/src/presets.js";
import { readPresets, writePresets } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireProjectRole } from "../lib/auth.js";

export const presetsRouter = Router();
const requireLetterer = requireProjectRole("letterer");

const PresetInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  text: PresetTextFieldsSchema,
  background: PresetBackgroundFieldsSchema,
});

presetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await readPresets(req.activeProject));
  })
);

presetsRouter.post(
  "/",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const parsed = PresetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_preset", details: parsed.error.flatten() });
      return;
    }
    const presets = await readPresets(req.activeProject);
    const next = [...presets, { id: randomUUID(), ...parsed.data }];
    await writePresets(next, req.activeProject);
    res.status(201).json(next);
  })
);

presetsRouter.put(
  "/:id",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const parsed = PresetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_preset", details: parsed.error.flatten() });
      return;
    }
    const presets = await readPresets(req.activeProject);
    const idx = presets.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "preset_not_found" });
      return;
    }
    const next = [...presets];
    next[idx] = { id: req.params.id, ...parsed.data };
    await writePresets(next, req.activeProject);
    res.json(next);
  })
);

presetsRouter.delete(
  "/:id",
  requireLetterer,
  asyncHandler(async (req, res) => {
    const presets = await readPresets(req.activeProject);
    const next = presets.filter((p) => p.id !== req.params.id);
    if (next.length === presets.length) {
      res.status(404).json({ error: "preset_not_found" });
      return;
    }
    await writePresets(next, req.activeProject);
    res.json(next);
  })
);
