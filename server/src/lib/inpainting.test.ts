import { describe, it, expect } from "vitest";
import { computeInpaintTiles, buildMaskCanvas, type InpaintBox } from "./inpainting.js";

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
});

describe("buildMaskCanvas", () => {
  function readPixel(canvas: ReturnType<typeof buildMaskCanvas>, x: number, y: number): [number, number, number, number] {
    const data = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
    return [data[0], data[1], data[2], data[3]];
  }

  it("fills the whole canvas black outside any box", () => {
    const canvas = buildMaskCanvas([{ x: 10, y: 10, width: 5, height: 5 }], 50, 50);
    expect(readPixel(canvas, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(readPixel(canvas, 49, 49)).toEqual([0, 0, 0, 255]);
  });

  it("fills box regions white", () => {
    const canvas = buildMaskCanvas([{ x: 10, y: 10, width: 5, height: 5 }], 50, 50);
    expect(readPixel(canvas, 12, 12)).toEqual([255, 255, 255, 255]);
  });

  it("expands each box by padding on every side", () => {
    const canvas = buildMaskCanvas([{ x: 20, y: 20, width: 10, height: 10 }], 50, 50, 4);
    // 2px inside the padded margin (box starts at 20, padding 4 -> white from x=16).
    expect(readPixel(canvas, 17, 25)).toEqual([255, 255, 255, 255]);
    // Just outside the padded margin.
    expect(readPixel(canvas, 14, 25)).toEqual([0, 0, 0, 255]);
  });

  it("fills every box when given more than one", () => {
    const canvas = buildMaskCanvas(
      [
        { x: 0, y: 0, width: 4, height: 4 },
        { x: 40, y: 40, width: 4, height: 4 },
      ],
      50,
      50
    );
    expect(readPixel(canvas, 2, 2)).toEqual([255, 255, 255, 255]);
    expect(readPixel(canvas, 42, 42)).toEqual([255, 255, 255, 255]);
    expect(readPixel(canvas, 25, 25)).toEqual([0, 0, 0, 255]);
  });
});
