import { describe, it, expect } from "vitest";
import { extractJsonFence } from "./actionUtils";

describe("extractJsonFence", () => {
  it("extracts and parses a fenced JSON block", () => {
    expect(extractJsonFence('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("returns null for plain text with no fence", () => {
    expect(extractJsonFence("just a normal reply")).toBeNull();
  });

  it("returns null for malformed JSON inside the fence", () => {
    expect(extractJsonFence("```json\nnot valid json\n```")).toBeNull();
  });
});
