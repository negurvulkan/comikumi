import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { computeInpaintTiles, computeInpaintTilesForMask, findMaskRegions, dilateMask, cropMaskForTile, type InpaintBox, type InpaintTile } from "./inpainting.js";

/** Builds a flat Uint8Array mask from a list of "on" rectangles — the same raster
 * shape findMaskRegions()/dilateMask()/computeInpaintTilesForMask() all operate on,
 * just constructed directly in tests instead of via a real painted PNG. */
function maskFromBoxes(boxes: InpaintBox[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const box of boxes) {
    for (let y = box.y; y < box.y + box.height; y++) {
      for (let x = box.x; x < box.x + box.width; x++) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

describe("computeInpaintTiles", () => {
  it("centers a full-size tile on the box when the image is large enough", () => {
    const box: InpaintBox = { x: 1000, y: 1000, width: 100, height: 40 };
    const [tile] = computeInpaintTiles([box], 3000, 4000);

    expect(tile.cropWidth).toBe(512);
    expect(tile.cropHeight).toBe(512);
    // Box center (1050, 1020) minus half the tile size.
    expect(tile.cropX).toBe(1050 - 256);
    expect(tile.cropY).toBe(1020 - 256);
    expect(tile.box).toBe(box);
  });

  it("clamps the crop to stay within the image when the box is near an edge", () => {
    const box: InpaintBox = { x: 5, y: 5, width: 20, height: 20 };
    const [tile] = computeInpaintTiles([box], 3000, 4000);

    expect(tile.cropX).toBe(0);
    expect(tile.cropY).toBe(0);
    expect(tile.cropWidth).toBe(512);
    expect(tile.cropHeight).toBe(512);
  });

  it("clamps against the opposite edge for a box near the bottom-right corner", () => {
    const box: InpaintBox = { x: 990, y: 990, width: 5, height: 5 };
    const [tile] = computeInpaintTiles([box], 1000, 1000);

    expect(tile.cropX).toBe(1000 - 512);
    expect(tile.cropY).toBe(1000 - 512);
  });

  it("shrinks the crop instead of clamping when the image itself is smaller than the tile size", () => {
    const box: InpaintBox = { x: 10, y: 10, width: 5, height: 5 };
    const [tile] = computeInpaintTiles([box], 300, 200);

    expect(tile.cropWidth).toBe(300);
    expect(tile.cropHeight).toBe(200);
    expect(tile.cropX).toBe(0);
    expect(tile.cropY).toBe(0);
  });

  it("returns one independent tile per box, in input order", () => {
    const boxes: InpaintBox[] = [
      { x: 100, y: 100, width: 10, height: 10 },
      { x: 2000, y: 3000, width: 10, height: 10 },
    ];
    const tiles = computeInpaintTiles(boxes, 3000, 4000);
    expect(tiles).toHaveLength(2);
    expect(tiles[0].box).toBe(boxes[0]);
    expect(tiles[1].box).toBe(boxes[1]);
  });

  it("grows the crop beyond 512px to fully contain a box wider than one tile, instead of cropping it off (regression: a wide title banner was previously split into multiple independently-reconstructed, seam-producing tiles)", () => {
    const box: InpaintBox = { x: 300, y: 200, width: 900, height: 150 };
    const [tile] = computeInpaintTiles([box], 3000, 4000);

    // The crop must fully contain the box (with margin), not just the fixed 512px.
    expect(tile.cropWidth).toBeGreaterThan(box.width);
    expect(tile.cropX).toBeLessThanOrEqual(box.x);
    expect(tile.cropX + tile.cropWidth).toBeGreaterThanOrEqual(box.x + box.width);
  });

  it("grows BOTH dimensions to the same square size, driven by the box's LARGER dimension — not just the axis the box itself needed (regression: growing only the needed axis produced a heavily non-square crop that had to be squished into the model's square input, visibly distorting the whole tile)", () => {
    const box: InpaintBox = { x: 300, y: 200, width: 900, height: 150 };
    const [tile] = computeInpaintTiles([box], 3000, 4000);

    expect(tile.cropWidth).toBe(tile.cropHeight);
    // The shorter (height) axis still grew to match the wider one, well past 512px.
    expect(tile.cropHeight).toBeGreaterThan(512);
    expect(tile.cropY).toBeLessThanOrEqual(box.y);
    expect(tile.cropY + tile.cropHeight).toBeGreaterThanOrEqual(box.y + box.height);
  });

  it("clamps a grown crop to the image bounds instead of exceeding them", () => {
    const box: InpaintBox = { x: 50, y: 50, width: 900, height: 40 };
    const [tile] = computeInpaintTiles([box], 1000, 1000);

    expect(tile.cropX).toBeGreaterThanOrEqual(0);
    expect(tile.cropX + tile.cropWidth).toBeLessThanOrEqual(1000);
  });
});

describe("findMaskRegions", () => {
  it("returns nothing for an all-zero mask", () => {
    expect(findMaskRegions(new Uint8Array(50 * 50), 50, 50)).toEqual([]);
  });

  it("finds the bounding box of a single filled rectangle", () => {
    const mask = maskFromBoxes([{ x: 10, y: 20, width: 5, height: 8 }], 50, 50);
    expect(findMaskRegions(mask, 50, 50)).toEqual([{ x: 10, y: 20, width: 5, height: 8 }]);
  });

  it("keeps two disjoint blobs as separate regions", () => {
    const mask = maskFromBoxes(
      [
        { x: 0, y: 0, width: 4, height: 4 },
        { x: 40, y: 40, width: 4, height: 4 },
      ],
      50,
      50
    );
    const regions = findMaskRegions(mask, 50, 50);
    expect(regions).toHaveLength(2);
    expect(regions).toContainEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(regions).toContainEqual({ x: 40, y: 40, width: 4, height: 4 });
  });

  it("merges two touching blobs into one region spanning both", () => {
    // Two rectangles sharing an edge (10..14 and 15..19 on x) are 4-connected, so they
    // must merge into one region — an L-shaped or irregular hand-painted stroke is
    // exactly this: many small locally-filled cells that all touch.
    const mask = maskFromBoxes(
      [
        { x: 10, y: 10, width: 5, height: 5 },
        { x: 15, y: 10, width: 5, height: 5 },
      ],
      50,
      50
    );
    expect(findMaskRegions(mask, 50, 50)).toEqual([{ x: 10, y: 10, width: 10, height: 5 }]);
  });

  it("does NOT merge two diagonally-adjacent blobs (4-connected, not 8-connected)", () => {
    const mask = maskFromBoxes(
      [
        { x: 10, y: 10, width: 2, height: 2 },
        { x: 12, y: 12, width: 2, height: 2 },
      ],
      50,
      50
    );
    expect(findMaskRegions(mask, 50, 50)).toHaveLength(2);
  });
});

describe("dilateMask", () => {
  function get(mask: Uint8Array, width: number, x: number, y: number): number {
    return mask[y * width + x];
  }

  it("is a no-op for radius 0", () => {
    const mask = maskFromBoxes([{ x: 10, y: 10, width: 2, height: 2 }], 30, 30);
    expect(dilateMask(mask, 30, 30, 0)).toBe(mask);
  });

  it("grows a single pixel into a (2r+1)-wide square", () => {
    const mask = maskFromBoxes([{ x: 15, y: 15, width: 1, height: 1 }], 30, 30);
    const dilated = dilateMask(mask, 30, 30, 2);
    // Exactly radius px in every direction should now be set...
    expect(get(dilated, 30, 13, 15)).toBe(1);
    expect(get(dilated, 30, 17, 15)).toBe(1);
    expect(get(dilated, 30, 15, 13)).toBe(1);
    expect(get(dilated, 30, 15, 17)).toBe(1);
    // ...but one px further is not.
    expect(get(dilated, 30, 12, 15)).toBe(0);
    expect(get(dilated, 30, 15, 18)).toBe(0);
  });

  it("clamps at the image edge instead of wrapping or throwing", () => {
    const mask = maskFromBoxes([{ x: 0, y: 0, width: 1, height: 1 }], 20, 20);
    const dilated = dilateMask(mask, 20, 20, 5);
    expect(get(dilated, 20, 0, 0)).toBe(1);
    expect(get(dilated, 20, 19, 19)).toBe(0);
  });

  it("keeps output strictly binary (0 or 1), even where two dilated regions overlap", () => {
    const mask = maskFromBoxes(
      [
        { x: 10, y: 10, width: 1, height: 1 },
        { x: 12, y: 10, width: 1, height: 1 },
      ],
      30,
      30
    );
    const dilated = dilateMask(mask, 30, 30, 3);
    expect(get(dilated, 30, 11, 10)).toBe(1);
    expect([...dilated].every((v) => v === 0 || v === 1)).toBe(true);
  });
});

describe("computeInpaintTilesForMask", () => {
  it("produces one centered tile per small region, matching computeInpaintTiles directly", () => {
    const box: InpaintBox = { x: 1000, y: 1000, width: 100, height: 40 };
    const mask = maskFromBoxes([box], 3000, 4000);
    const [tile] = computeInpaintTilesForMask(mask, 3000, 4000);
    const [expected] = computeInpaintTiles([box], 3000, 4000);
    expect(tile.cropX).toBe(expected.cropX);
    expect(tile.cropY).toBe(expected.cropY);
    expect(tile.cropWidth).toBe(512);
    expect(tile.cropHeight).toBe(512);
  });

  it("returns one tile per disjoint region", () => {
    const mask = maskFromBoxes(
      [
        { x: 100, y: 100, width: 10, height: 10 },
        { x: 2000, y: 3000, width: 10, height: 10 },
      ],
      3000,
      4000
    );
    expect(computeInpaintTilesForMask(mask, 3000, 4000)).toHaveLength(2);
  });

  it("covers a region larger than one tile with a single grown crop, not multiple seam-producing tiles (regression, see computeInpaintTiles' own doc comment)", () => {
    // 800x800 region, well beyond the 512px tile size in both dimensions.
    const region: InpaintBox = { x: 100, y: 100, width: 800, height: 800 };
    const mask = maskFromBoxes([region], 3000, 3000);
    const tiles = computeInpaintTilesForMask(mask, 3000, 3000);
    expect(tiles).toHaveLength(1);
    const [tile] = tiles;
    expect(tile.cropWidth).toBeGreaterThan(region.width);
    expect(tile.cropHeight).toBeGreaterThan(region.height);
    expect(tile.cropX).toBeLessThanOrEqual(region.x);
    expect(tile.cropY).toBeLessThanOrEqual(region.y);
    expect(tile.cropX + tile.cropWidth).toBeGreaterThanOrEqual(region.x + region.width);
    expect(tile.cropY + tile.cropHeight).toBeGreaterThanOrEqual(region.y + region.height);
  });

  it("returns nothing for an empty mask", () => {
    expect(computeInpaintTilesForMask(new Uint8Array(3000 * 4000), 3000, 4000)).toEqual([]);
  });
});

describe("cropMaskForTile", () => {
  // Regression coverage for a real live bug: sharp's .resize() on a single-channel
  // raw-input pipeline silently comes back 3-channel (RGB) even when both the input
  // and requested output are single-channel — the buffer maskBufferToMaskTensor()
  // expects was actually 3x too long, so it read the wrong byte for nearly every
  // pixel, producing a near-garbage mask (bubbles weren't erased at all; the one
  // region that changed came back visibly corrupted). cropMaskForTile()'s
  // toColourspace("b-w") call is what fixes this — these tests would fail without it.

  it("returns exactly tileSize*tileSize bytes (single channel), not 3x that", async () => {
    const width = 200;
    const height = 200;
    const mask = new Uint8Array(width * height);
    mask.fill(1);
    const pipeline = sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } });
    const tile: InpaintTile = { box: { x: 0, y: 0, width, height }, cropX: 0, cropY: 0, cropWidth: width, cropHeight: height };

    const cropped = await cropMaskForTile(pipeline, tile, 64);

    expect(cropped.length).toBe(64 * 64);
  });

  it("preserves an all-on mask as all-on after crop and resize", async () => {
    const width = 200;
    const height = 200;
    const mask = new Uint8Array(width * height);
    mask.fill(1);
    const pipeline = sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } });
    const tile: InpaintTile = { box: { x: 0, y: 0, width, height }, cropX: 0, cropY: 0, cropWidth: width, cropHeight: height };

    const cropped = await cropMaskForTile(pipeline, tile, 64);

    expect([...cropped].every((v) => v > 0)).toBe(true);
  });

  it("preserves an all-off mask as all-off after crop and resize", async () => {
    const width = 200;
    const height = 200;
    const mask = new Uint8Array(width * height);
    const pipeline = sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } });
    const tile: InpaintTile = { box: { x: 0, y: 0, width, height }, cropX: 0, cropY: 0, cropWidth: width, cropHeight: height };

    const cropped = await cropMaskForTile(pipeline, tile, 64);

    expect([...cropped].every((v) => v === 0)).toBe(true);
  });

  it("only marks the cropped/resized region actually covered by the mask, not the whole tile (catches a stride-shift misreading unrelated bytes as \"on\")", async () => {
    const width = 200;
    const height = 200;
    const mask = maskFromBoxes([{ x: 0, y: 0, width: 100, height: 200 }], width, height); // left half only
    const pipeline = sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } });
    const tile: InpaintTile = { box: { x: 0, y: 0, width, height }, cropX: 0, cropY: 0, cropWidth: width, cropHeight: height };

    const cropped = await cropMaskForTile(pipeline, tile, 64);
    expect(cropped.length).toBe(64 * 64);

    // Left half of the resized 64x64 tile should be "on", right half "off" — read
    // directly (cropped IS already the raw single-channel 64x64 buffer; no need to
    // wrap it in another sharp pipeline).
    for (let y = 0; y < 64; y++) {
      expect(cropped[y * 64 + 10]).toBeGreaterThan(0); // well inside the left (masked) half
      expect(cropped[y * 64 + 54]).toBe(0); // well inside the right (unmasked) half
    }
  });
});
