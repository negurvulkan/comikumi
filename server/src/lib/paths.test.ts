import { describe, it, expect } from "vitest";
import { emptyFolderName, isSafeFileName, isSafeFolderPath, languageFolderName, letteringFolderName, renderTemplate } from "./paths.js";

describe("renderTemplate", () => {
  it("interpolates known {key} placeholders", () => {
    expect(renderTemplate("{book}_{folderSuffix}", { book: "volume_01", folderSuffix: "german" })).toBe(
      "volume_01_german"
    );
  });

  it("leaves unknown placeholders as literal text", () => {
    expect(renderTemplate("{book}_{unknown}", { book: "volume_01" })).toBe("volume_01_{unknown}");
  });
});

describe("folder-name helpers", () => {
  it("emptyFolderName appends the empty suffix", () => {
    expect(emptyFolderName("volume_01", "_empty")).toBe("volume_01_empty");
  });

  it("letteringFolderName appends the lettering suffix", () => {
    expect(letteringFolderName("volume_01", "_lettering")).toBe("volume_01_lettering");
  });

  it("languageFolderName renders the export template with book + folderSuffix", () => {
    expect(languageFolderName("volume_01", "german", "{book}_{folderSuffix}")).toBe("volume_01_german");
  });
});

describe("isSafeFileName", () => {
  it("accepts a plain file name", () => {
    expect(isSafeFileName("bubble.svg")).toBe(true);
  });

  it("rejects empty, '.', and '..'", () => {
    expect(isSafeFileName("")).toBe(false);
    expect(isSafeFileName(".")).toBe(false);
    expect(isSafeFileName("..")).toBe(false);
  });

  it("rejects names containing path separators or traversal segments", () => {
    expect(isSafeFileName("../secret.json")).toBe(false);
    expect(isSafeFileName("..\\secret.json")).toBe(false);
    expect(isSafeFileName("sub/file.png")).toBe(false);
    expect(isSafeFileName("sub\\file.png")).toBe(false);
  });
});

describe("isSafeFolderPath", () => {
  it("accepts the root (empty string)", () => {
    expect(isSafeFolderPath("")).toBe(true);
  });

  it("accepts a valid single- or multi-segment path", () => {
    expect(isSafeFolderPath("effects")).toBe(true);
    expect(isSafeFolderPath("effects/fire")).toBe(true);
  });

  it("rejects '..'/'.' segments anywhere in the path", () => {
    expect(isSafeFolderPath("..")).toBe(false);
    expect(isSafeFolderPath("effects/..")).toBe(false);
    expect(isSafeFolderPath("../effects")).toBe(false);
    expect(isSafeFolderPath(".")).toBe(false);
  });

  it("rejects empty segments, leading/trailing slashes, and backslashes", () => {
    expect(isSafeFolderPath("effects//fire")).toBe(false);
    expect(isSafeFolderPath("/effects")).toBe(false);
    expect(isSafeFolderPath("effects/")).toBe(false);
    expect(isSafeFolderPath("effects\\fire")).toBe(false);
  });
});
