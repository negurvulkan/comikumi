import { describe, expect, it } from "vitest";
import { getConnector, listConnectors } from "./registry.js";

describe("connector registry", () => {
  it("resolves the ai-manga connector by id", () => {
    expect(getConnector("ai-manga")?.id).toBe("ai-manga");
  });

  it("returns undefined for an unknown connector id", () => {
    expect(getConnector("does-not-exist")).toBeUndefined();
  });

  it("lists every registered connector", () => {
    expect(listConnectors().map((c) => c.id)).toEqual(["ai-manga"]);
  });
});
