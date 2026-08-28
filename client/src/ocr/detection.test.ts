import { describe, it, expect } from "vitest";
import {
  sigmoid,
  computePreprocessInfo,
  logitsToProbMap,
  binarize,
  connectedComponents,
  boxFromComponent,
  unclipBox,
  mapBoxToOriginal,
  clampBoxToImage,
  decodeDetections,
  TEXT_THRESH,
  BOX_THRESH,
  MIN_BOX_SIZE,
} from "./detection";

describe("sigmoid", () => {
  it("maps 0 to 0.5", () => {
    expect(sigmoid(0)).toBeCloseTo(0.5);
  });
  it("saturates toward 0/1 for large negative/positive inputs", () => {
    expect(sigmoid(-20)).toBeCloseTo(0, 5);
    expect(sigmoid(20)).toBeCloseTo(1, 5);
  });
});

describe("computePreprocessInfo", () => {
  it("scales the longest side to targetSize", () => {
    const info = computePreprocessInfo(1000, 2000, 2048);
    expect(info.scale).toBeCloseTo(2048 / 2000);
  });
  it("uses the width when it's the longer side", () => {
    const info = computePreprocessInfo(2000, 1000, 2048);
    expect(info.scale).toBeCloseTo(2048 / 2000);
  });
});

describe("logitsToProbMap / binarize", () => {
  it("binarizes at the TEXT_THRESH probability, not the raw logit", () => {
    // logit 0 -> prob 0.5, exactly at threshold -> included ('>=').
    const probMap = logitsToProbMap(new Float32Array([0, -10, 10]), 3, 1);
    expect(probMap.data[0]).toBeCloseTo(0.5);
    const mask = binarize(probMap, TEXT_THRESH);
    expect(Array.from(mask)).toEqual([1, 0, 1]);
  });
});

describe("connectedComponents", () => {
  it("finds a single 2x2 square as one component", () => {
    // 4x4 grid, ones at (1,1),(2,1),(1,2),(2,2)
    // prettier-ignore
    const mask = new Uint8Array([
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 1, 1, 0,
      0, 0, 0, 0,
    ]);
    const components = connectedComponents(mask, 4, 4);
    expect(components.length).toBe(1);
    expect(components[0].length).toBe(4);
  });

  it("separates two diagonally-touching (not 4-connected) blobs into two components", () => {
    // prettier-ignore
    const mask = new Uint8Array([
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]);
    const components = connectedComponents(mask, 3, 3);
    expect(components.length).toBe(3); // no 4-connectivity between any of these three pixels
  });

  it("merges an L-shape (4-connected) into one component", () => {
    // prettier-ignore
    const mask = new Uint8Array([
      1, 0, 0,
      1, 0, 0,
      1, 1, 1,
    ]);
    const components = connectedComponents(mask, 3, 3);
    expect(components.length).toBe(1);
    expect(components[0].length).toBe(5);
  });

  it("returns no components for an all-zero mask", () => {
    const mask = new Uint8Array(16);
    expect(connectedComponents(mask, 4, 4)).toEqual([]);
  });
});

describe("boxFromComponent", () => {
  const width = 10;
  function fakeProbMap(confidence: number): { data: Float32Array; width: number; height: number } {
    const data = new Float32Array(100).fill(confidence);
    return { data, width, height: 10 };
  }

  it("computes the axis-aligned bounding box of the given pixels", () => {
    // (2,2),(3,2),(4,2),(2,3),(3,3),(4,3),(2,4),(3,4),(4,4) — a 3x3 block at (2,2).
    const pixels = [22, 23, 24, 32, 33, 34, 42, 43, 44];
    const box = boxFromComponent(pixels, width, fakeProbMap(0.9));
    expect(box).toMatchObject({ x: 2, y: 2, width: 3, height: 3 });
  });

  it("rejects a component smaller than MIN_BOX_SIZE in either dimension", () => {
    const pixels = [0, 1]; // a 2-wide, 1-tall sliver — below MIN_BOX_SIZE=3
    expect(boxFromComponent(pixels, width, fakeProbMap(0.9))).toBeNull();
  });

  it("rejects a component whose mean confidence is below BOX_THRESH", () => {
    const pixels = [0, 1, 2, width, width + 1, width + 2, width * 2, width * 2 + 1, width * 2 + 2]; // 3x3
    expect(boxFromComponent(pixels, width, fakeProbMap(BOX_THRESH - 0.01))).toBeNull();
  });

  it("accepts a component clearly above BOX_THRESH confidence, at MIN_BOX_SIZE", () => {
    // Not testing exact floating-point equality at the threshold (float32 sum/divide
    // rounding makes an exact-boundary assertion flaky) — comfortably above instead.
    const pixels = [0, 1, 2, width, width + 1, width + 2, width * 2, width * 2 + 1, width * 2 + 2]; // 3x3
    const box = boxFromComponent(pixels, width, fakeProbMap(BOX_THRESH + 0.1));
    expect(box).toMatchObject({ width: 3, height: 3 });
    expect(box!.confidence).toBeGreaterThan(BOX_THRESH);
  });
});

describe("unclipBox", () => {
  it("expands the box outward symmetrically, keeping its center fixed", () => {
    const box = { x: 10, y: 10, width: 20, height: 20, confidence: 0.9 };
    const unclipped = unclipBox(box, 2.3);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    expect(unclipped.x + unclipped.width / 2).toBeCloseTo(centerX);
    expect(unclipped.y + unclipped.height / 2).toBeCloseTo(centerY);
    expect(unclipped.width).toBeGreaterThan(box.width);
    expect(unclipped.height).toBeGreaterThan(box.height);
  });

  it("a larger ratio expands further", () => {
    const box = { x: 0, y: 0, width: 20, height: 20, confidence: 0.9 };
    const small = unclipBox(box, 1);
    const large = unclipBox(box, 3);
    expect(large.width).toBeGreaterThan(small.width);
  });
});

describe("mapBoxToOriginal", () => {
  it("divides coordinates by the preprocess scale", () => {
    const info = computePreprocessInfo(1000, 500, 2000); // scale = 2
    const box = { x: 100, y: 50, width: 40, height: 20, confidence: 0.9 };
    const mapped = mapBoxToOriginal(box, info);
    expect(mapped).toMatchObject({ x: 50, y: 25, width: 20, height: 10 });
  });
});

describe("clampBoxToImage", () => {
  it("clips a box that overhangs the image bounds", () => {
    const box = { x: -5, y: -5, width: 20, height: 20, confidence: 0.9 };
    const clamped = clampBoxToImage(box, 10, 10);
    expect(clamped).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
  });

  it("leaves a fully-inside box untouched", () => {
    const box = { x: 2, y: 2, width: 5, height: 5, confidence: 0.9 };
    expect(clampBoxToImage(box, 10, 10)).toMatchObject(box);
  });

  it("never returns negative width/height for a box entirely outside the image", () => {
    const box = { x: 100, y: 100, width: 5, height: 5, confidence: 0.9 };
    const clamped = clampBoxToImage(box, 10, 10);
    expect(clamped.width).toBe(0);
    expect(clamped.height).toBe(0);
  });
});

describe("decodeDetections (full pipeline)", () => {
  it("finds one box for a single high-confidence blob and maps it to original coordinates", () => {
    const mapSize = 8;
    const logits = new Float32Array(mapSize * mapSize).fill(-10); // background: low prob
    // A 3x3 high-confidence block at (2,2)-(4,4).
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        logits[y * mapSize + x] = 10; // sigmoid(10) ~= 1
      }
    }
    const info = computePreprocessInfo(mapSize, mapSize, mapSize); // scale = 1, no resize
    const boxes = decodeDetections(logits, mapSize, mapSize, info);
    expect(boxes.length).toBe(1);
    // The raw 3x3 box gets unclipped (expanded) then clamped back into the 8x8 image.
    expect(boxes[0].x).toBeLessThanOrEqual(2);
    expect(boxes[0].y).toBeLessThanOrEqual(2);
    expect(boxes[0].width).toBeGreaterThan(3);
    expect(boxes[0].confidence).toBeGreaterThan(BOX_THRESH);
  });

  it("finds no boxes when every pixel is below TEXT_THRESH", () => {
    const mapSize = 8;
    const logits = new Float32Array(mapSize * mapSize).fill(-10);
    const info = computePreprocessInfo(mapSize, mapSize, mapSize);
    expect(decodeDetections(logits, mapSize, mapSize, info)).toEqual([]);
  });

  it("drops a component too small to pass MIN_BOX_SIZE even if fully confident", () => {
    const mapSize = 8;
    const logits = new Float32Array(mapSize * mapSize).fill(-10);
    logits[0] = 10; // a single lit pixel, 1x1 — below MIN_BOX_SIZE
    const info = computePreprocessInfo(mapSize, mapSize, mapSize);
    expect(decodeDetections(logits, mapSize, mapSize, info)).toEqual([]);
  });
});
