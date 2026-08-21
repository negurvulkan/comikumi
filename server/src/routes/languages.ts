import { Router } from "express";
import { LanguageDefSchema } from "../../../shared/src/languages.js";
import { readLanguages, writeLanguages } from "../lib/projectStore.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const languagesRouter = Router();

languagesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await readLanguages());
  })
);

languagesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = LanguageDefSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid language", details: parsed.error.flatten() });
      return;
    }
    const languages = await readLanguages();
    if (languages.some((l) => l.code === parsed.data.code)) {
      res.status(409).json({ error: `Sprachcode "${parsed.data.code}" existiert bereits` });
      return;
    }
    if (languages.some((l) => l.folderSuffix === parsed.data.folderSuffix)) {
      res.status(409).json({ error: `Ordner-Suffix "${parsed.data.folderSuffix}" wird bereits verwendet` });
      return;
    }
    const next = [...languages, parsed.data];
    await writeLanguages(next);
    res.status(201).json(next);
  })
);

languagesRouter.put(
  "/:code",
  asyncHandler(async (req, res) => {
    const parsed = LanguageDefSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid language", details: parsed.error.flatten() });
      return;
    }
    const languages = await readLanguages();
    const idx = languages.findIndex((l) => l.code === req.params.code);
    if (idx === -1) {
      res.status(404).json({ error: "Sprache nicht gefunden" });
      return;
    }
    const codeClash = languages.some((l, i) => i !== idx && l.code === parsed.data.code);
    const suffixClash = languages.some((l, i) => i !== idx && l.folderSuffix === parsed.data.folderSuffix);
    if (codeClash || suffixClash) {
      res.status(409).json({ error: "Sprachcode oder Ordner-Suffix wird bereits verwendet" });
      return;
    }
    const next = [...languages];
    next[idx] = parsed.data;
    await writeLanguages(next);
    res.json(next);
  })
);

languagesRouter.delete(
  "/:code",
  asyncHandler(async (req, res) => {
    const languages = await readLanguages();
    const next = languages.filter((l) => l.code !== req.params.code);
    if (next.length === languages.length) {
      res.status(404).json({ error: "Sprache nicht gefunden" });
      return;
    }
    await writeLanguages(next);
    res.json(next);
  })
);
