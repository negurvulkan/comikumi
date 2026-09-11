import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildManifest, buildZip } from "../lib/connectors/aiMangaConnector.js";
import type { PublishManifestInput } from "../lib/connectors/types.js";

/**
 * One-off generator for the "sample manifest or export ZIP" AI MANGA asks partner
 * applicants for (https://a-i-manga.com/en/developers/connect's "Get connected"
 * section) — reuses the CONNECTOR'S OWN buildManifest()/buildZip() (see
 * server/src/lib/connectors/aiMangaConnector.ts) rather than hand-writing a sample,
 * so what AI MANGA reviews is byte-for-byte what ComiKumi's real publish flow produces.
 *
 * Not part of the app itself — run once via `npx tsx src/scripts/generateAiMangaSample.ts`
 * from the server/ directory, then delete this file (or keep it if it's useful again
 * later for a second partner submission attempt).
 */

async function placeholderPage(width: number, height: number, label: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f2f2f2"/>
    <rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#333" stroke-width="4"/>
    <text x="50%" y="50%" font-family="sans-serif" font-size="64" fill="#333" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const outDir = path.join(process.cwd(), "ai-manga-sample");
  await fs.mkdir(outDir, { recursive: true });

  const cover = await placeholderPage(1000, 1500, "Cover");
  const pages = await Promise.all([1, 2, 3].map((n) => placeholderPage(1000, 1500, `Page ${n}`)));

  const input: PublishManifestInput = {
    seriesExternalId: "comikumi-sample-series-001",
    seriesTitle: "City After Sunset",
    sourceLanguage: "en",
    synopsis: "A courier follows a signal through a city that never quite sleeps.",
    genres: ["Action", "Sci-Fi"],
    cover,
    chapter: {
      externalId: "comikumi-sample-series-001-chapter-001",
      number: 1,
      title: "The Signal",
      pages,
      published: false, // a draft is the safer default for a review sample
      accessMode: "free",
    },
  };

  const chapterFolder = "chapter-001";
  const manifest = buildManifest(input, chapterFolder);
  const zip = await buildZip(manifest, input, chapterFolder);

  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  await fs.writeFile(path.join(outDir, "comikumi-sample-export.zip"), zip);

  console.log(`Written to ${outDir}`);
}

void main();
