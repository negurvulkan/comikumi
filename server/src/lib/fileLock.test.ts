import { describe, expect, it } from "vitest";
import { withFileLock } from "./fileLock.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withFileLock", () => {
  it("serializes concurrent calls for the same key, in call order", async () => {
    const order: number[] = [];
    const calls = [1, 2, 3].map((n) =>
      withFileLock("same-key", async () => {
        // The later calls would finish first without the lock, since they don't wait.
        await delay(n === 1 ? 20 : 0);
        order.push(n);
      })
    );
    await Promise.all(calls);
    expect(order).toEqual([1, 2, 3]);
  });

  it("does not serialize calls for different keys", async () => {
    const start = Date.now();
    await Promise.all([
      withFileLock("key-a", () => delay(30)),
      withFileLock("key-b", () => delay(30)),
    ]);
    // If these were serialized they'd take ~60ms; running in parallel should stay
    // comfortably under that.
    expect(Date.now() - start).toBeLessThan(55);
  });

  it("a rejected call does not break the queue for later calls on the same key", async () => {
    const first = withFileLock("recovers", async () => {
      throw new Error("boom");
    });
    await expect(first).rejects.toThrow("boom");

    const second = await withFileLock("recovers", async () => "ok");
    expect(second).toBe("ok");
  });

  it("returns the wrapped function's resolved value", async () => {
    const result = await withFileLock("value-key", async () => 42);
    expect(result).toBe(42);
  });
});
