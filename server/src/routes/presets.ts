import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PresetTextFieldsSchema, PresetBackgroundFieldsSchema } from "../../../shared/src/presets.js";
import { readPresets, writePresets } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const presetsRouter = Router();

const PresetInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  text: PresetTextFieldsSchema,
  background: PresetBackgroundFieldsSchema,
});

presetsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await readPresets());
  })
);

presetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = PresetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_preset", details: parsed.error.flatten() });
      return;
    }
    const presets = await readPresets();
    const next = [...presets, { id: randomUUID(), ...parsed.data }];
    await writePresets(next);
    res.status(201).json(next);
  })
);

presetsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = PresetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_preset", details: parsed.error.flatten() });
      return;
    }
    const presets = await readPresets();
    const idx = presets.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "preset_not_found" });
      return;
    }
    const next = [...presets];
    next[idx] = { id: req.params.id, ...parsed.data };
    await writePresets(next);
    res.json(next);
  })
);

presetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const presets = await readPresets();
    const next = presets.filter((p) => p.id !== req.params.id);
    if (next.length === presets.length) {
      res.status(404).json({ error: "preset_not_found" });
      return;
    }
    await writePresets(next);
    res.json(next);
  })
);
