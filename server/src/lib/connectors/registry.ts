import type { PublishingConnector } from "./types.js";
import { aiMangaConnector } from "./aiMangaConnector.js";

const connectors: Record<string, PublishingConnector> = {
  "ai-manga": aiMangaConnector,
};

export function getConnector(id: string): PublishingConnector | undefined {
  return connectors[id];
}

export function listConnectors(): PublishingConnector[] {
  return Object.values(connectors);
}
