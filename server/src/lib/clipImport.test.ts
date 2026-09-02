import { describe, it, expect } from "vitest";
import {
  parseClipChunks,
  readExtaChunk,
  parseBlockDataChunks,
  decodePackedTile14,
  resolveEffectiveLayerVisibility,
  canUseFullResolutionComposite,
  type ClipLayer,
} from "./clipImport.js";

/** Builds a minimal synthetic .clip container (CSFCHUNK -> CHNKHead -> CHNKSQLi) around
 * an arbitrary "sqlite" payload, matching the verified real-file byte layout exactly. */
function buildClipBuffer(sqlitePayload: Buffer): Buffer {
  const headChunkPos = 24; // CSFCHUNK is always exactly 24 bytes (magic + 2 u64s)
  const headChunk = Buffer.alloc(56); // magic(8) + size(8) + v256(8) + sqlite_pos(8) + guid_size(8) + guid(16)
  headChunk.write("CHNKHead", 0, "ascii");
  headChunk.writeBigUInt64BE(40n, 8);
  headChunk.writeBigUInt64BE(256n, 16);
  const sqliteChunkPos = headChunkPos + headChunk.length;
  headChunk.writeBigUInt64BE(BigInt(sqliteChunkPos), 24);
  headChunk.writeBigUInt64BE(16n, 32);

  const sqliteChunk = Buffer.alloc(16 + sqlitePayload.length);
  sqliteChunk.write("CHNKSQLi", 0, "ascii");
  sqliteChunk.writeBigUInt64BE(BigInt(sqlitePayload.length), 8);
  sqlitePayload.copy(sqliteChunk, 16);

  const csfChunk = Buffer.alloc(24);
  csfChunk.write("CSFCHUNK", 0, "ascii");
  csfChunk.writeBigUInt64BE(BigInt(csfChunk.length + headChunk.length + sqliteChunk.length), 8);
  csfChunk.writeBigUInt64BE(BigInt(headChunkPos), 16);

  return Buffer.concat([csfChunk, headChunk, sqliteChunk]);
}

describe("parseClipChunks", () => {
  it("extracts the embedded sqlite payload from a well-formed container", () => {
    const payload = Buffer.from("SQLite format 3\0fake-database-bytes");
    const buffer = buildClipBuffer(payload);

    const { sqliteBlob } = parseClipChunks(buffer);

    expect(sqliteBlob.equals(payload)).toBe(true);
  });

  it("rejects a buffer that doesn't start with the CSFCHUNK magic", () => {
    const buffer = Buffer.from("not a clip file at all, way too short even");
    expect(() => parseClipChunks(buffer)).toThrow("not_a_clip_file");
  });

  it("rejects a buffer whose head_chunk_pos points somewhere without a CHNKHead magic", () => {
    const buffer = Buffer.alloc(64);
    buffer.write("CSFCHUNK", 0, "ascii");
    buffer.writeBigUInt64BE(64n, 8);
    buffer.writeBigUInt64BE(24n, 16); // points into zeroed-out garbage, not "CHNKHead"
    expect(() => parseClipChunks(buffer)).toThrow("invalid_clip_head_chunk");
  });

  it("rejects a well-formed CHNKHead whose sqlite_chunk_pos points at garbage", () => {
    const headChunk = Buffer.alloc(56);
    headChunk.write("CHNKHead", 0, "ascii");
    headChunk.writeBigUInt64BE(40n, 8);
    headChunk.writeBigUInt64BE(256n, 16);
    headChunk.writeBigUInt64BE(9999n, 24); // out of bounds / not a real CHNKSQLi
    headChunk.writeBigUInt64BE(16n, 32);

    const csfChunk = Buffer.alloc(24);
    csfChunk.write("CSFCHUNK", 0, "ascii");
    csfChunk.writeBigUInt64BE(BigInt(csfChunk.length + headChunk.length), 8);
    csfChunk.writeBigUInt64BE(24n, 16);

    const buffer = Buffer.concat([csfChunk, headChunk]);
    expect(() => parseClipChunks(buffer)).toThrow("invalid_clip_sqlite_chunk");
  });
});

/** Builds a synthetic CHNKExta chunk (magic + size + ext_id_len=40 + ext_id + body_size
 * + body), matching the verified real-file byte layout. */
function buildExtaChunk(extId: string, body: Buffer): Buffer {
  const paddedExtId = extId.padEnd(40, "\0").slice(0, 40);
  const chunk = Buffer.alloc(72 + body.length);
  chunk.write("CHNKExta", 0, "ascii");
  chunk.writeBigUInt64BE(BigInt(chunk.length), 8);
  chunk.writeBigUInt64BE(40n, 16);
  chunk.write(paddedExtId, 24, "ascii");
  chunk.writeBigUInt64BE(BigInt(body.length), 64);
  body.copy(chunk, 72);
  return chunk;
}

describe("readExtaChunk", () => {
  it("extracts the ext id and body from a well-formed chunk at a given offset", () => {
    const body = Buffer.from("some tile payload bytes");
    const padding = Buffer.alloc(10);
    const buffer = Buffer.concat([padding, buildExtaChunk("extrnlidABCDEF0123456789ABCDEF0123456789", body)]);

    const { extId, body: readBody } = readExtaChunk(buffer, padding.length);

    expect(extId).toBe("extrnlidABCDEF0123456789ABCDEF0123456789");
    expect(readBody.equals(body)).toBe(true);
  });

  it("rejects an offset that doesn't point at a CHNKExta magic", () => {
    const buffer = Buffer.alloc(100);
    expect(() => readExtaChunk(buffer, 0)).toThrow("invalid_exta_chunk");
  });
});

/** Builds a single synthetic BlockDataChunk: 4-byte BE total length (self-inclusive) +
 * "BlockDataBeginChunk" tag + 16 unknown bytes + data_flag + optional compressed
 * payload (BE inner size, then LE data size, matching the verified real layout). */
function buildBlockDataChunk(compressed: Buffer | null): Buffer {
  const tagText = "BlockDataBeginChunk";
  const tagBytes = Buffer.from(tagText, "utf16le");
  tagBytes.swap16();
  const tagField = Buffer.concat([Buffer.alloc(4), tagBytes]);
  tagField.writeUInt32BE(tagText.length, 0);

  const unknown = Buffer.alloc(16);
  const dataFlag = Buffer.alloc(4);
  let dataSection = Buffer.alloc(0);
  if (compressed) {
    dataFlag.writeUInt32BE(1, 0);
    const innerSize = Buffer.alloc(4);
    innerSize.writeUInt32BE(compressed.length + 4, 0);
    const dataSize = Buffer.alloc(4);
    dataSize.writeUInt32LE(compressed.length, 0);
    dataSection = Buffer.concat([innerSize, dataSize, compressed]);
  }

  const withoutSize = Buffer.concat([tagField, unknown, dataFlag, dataSection]);
  const sizeField = Buffer.alloc(4);
  sizeField.writeUInt32BE(4 + withoutSize.length, 0);
  return Buffer.concat([sizeField, withoutSize]);
}

describe("parseBlockDataChunks", () => {
  it("parses a mix of empty and data-carrying blocks in order", () => {
    const compressed = Buffer.from("compressed-bytes-here");
    const body = Buffer.concat([buildBlockDataChunk(null), buildBlockDataChunk(compressed), buildBlockDataChunk(null)]);

    const blocks = parseBlockDataChunks(body);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBeNull();
    expect(blocks[1]?.equals(compressed)).toBe(true);
    expect(blocks[2]).toBeNull();
  });

  it("stops cleanly (without throwing) at a trailing non-block tag like BlockStatus", () => {
    const trailing = Buffer.alloc(20);
    trailing.write("garbage-not-a-block-tag");
    const body = Buffer.concat([buildBlockDataChunk(null), trailing]);

    const blocks = parseBlockDataChunks(body);

    expect(blocks).toHaveLength(1);
  });

  it("returns an empty list for an empty body", () => {
    expect(parseBlockDataChunks(Buffer.alloc(0))).toEqual([]);
  });
});

describe("decodePackedTile14", () => {
  it("maps a leading alpha plane + interleaved BGRX block to RGBA correctly", () => {
    const k = 256 * 256;
    const inflated = Buffer.alloc(5 * k);
    inflated.fill(200, 0, k); // alpha plane: constant 200
    for (let p = 0; p < k; p++) {
      inflated[k + p * 4] = 10; // B
      inflated[k + p * 4 + 1] = 20; // G
      inflated[k + p * 4 + 2] = 30; // R
      inflated[k + p * 4 + 3] = 255; // unused padding byte
    }

    const rgba = decodePackedTile14(inflated);

    expect(rgba[0]).toBe(30); // R
    expect(rgba[1]).toBe(20); // G
    expect(rgba[2]).toBe(10); // B
    expect(rgba[3]).toBe(200); // A
    // spot-check a pixel deep into the buffer, not just the first one
    const lastPixel = k - 1;
    expect(rgba[lastPixel * 4]).toBe(30);
    expect(rgba[lastPixel * 4 + 3]).toBe(200);
  });

  it("throws on a buffer that isn't exactly 5*256*256 bytes", () => {
    expect(() => decodePackedTile14(Buffer.alloc(100))).toThrow("unexpected_tile_size");
  });
});

function layer(overrides: Partial<ClipLayer> & { id: number }): ClipLayer {
  return {
    name: "",
    layerType: 1,
    visible: true,
    opacity: 256,
    nextIndex: null,
    firstChildIndex: null,
    ...overrides,
  };
}

describe("resolveEffectiveLayerVisibility", () => {
  it("returns only leaf layers, in traversal order", () => {
    // root(1) -> a(2), b(3)  (siblings, no folders)
    const layers = [layer({ id: 1, firstChildIndex: 2 }), layer({ id: 2, nextIndex: 3 }), layer({ id: 3 })];

    const resolved = resolveEffectiveLayerVisibility(layers, 1);

    expect(resolved.map((l) => l.id)).toEqual([2, 3]);
  });

  it("hides an entire subtree when its parent folder is hidden, regardless of each child's own flag", () => {
    // root(1) -> folder(2, hidden, children start at 3) -> leaf(3, itself visible)
    const layers = [
      layer({ id: 1, firstChildIndex: 2 }),
      layer({ id: 2, visible: false, firstChildIndex: 3 }),
      layer({ id: 3, visible: true }),
    ];

    const resolved = resolveEffectiveLayerVisibility(layers, 1);

    expect(resolved).toEqual([]);
  });

  it("treats a LayerVisibility bitmask value with extra bits set as still visible", () => {
    // Matches the real bug this session: LayerVisibility=3 (bits 0+1) must count as visible.
    const layers = [layer({ id: 1, firstChildIndex: 2 }), layer({ id: 2, visible: (3 & 1) === 1 })];

    const resolved = resolveEffectiveLayerVisibility(layers, 1);

    expect(resolved.map((l) => l.id)).toEqual([2]);
  });

  it("multiplies opacity down through nested folders", () => {
    // root(1) -> folder(2, 50%, child=3) -> leaf(3, 50%) => 0.25 effective
    const layers = [
      layer({ id: 1, firstChildIndex: 2 }),
      layer({ id: 2, opacity: 128, firstChildIndex: 3 }),
      layer({ id: 3, opacity: 128 }),
    ];

    const resolved = resolveEffectiveLayerVisibility(layers, 1);

    expect(resolved[0].effectiveOpacity).toBeCloseTo(0.25, 2);
  });
});

describe("canUseFullResolutionComposite", () => {
  const supportedTiles = { tileCols: 1, tileRows: 1, packingType: [1, 4] as const, hasRealData: true, tiles: [Buffer.alloc(1)] };

  it("is true when every layer is raster/paper with supported, real tile data", () => {
    const resolved = [
      { id: 1, layerType: 1584, effectiveOpacity: 1, tiles: null }, // Paper: no tiles needed
      { id: 2, layerType: 1, effectiveOpacity: 1, tiles: supportedTiles },
    ];
    expect(canUseFullResolutionComposite(resolved)).toBe(true);
  });

  it("is false when a layer has an unsupported LayerType (e.g. vector/other)", () => {
    const resolved = [{ id: 1, layerType: 0, effectiveOpacity: 1, tiles: null }];
    expect(canUseFullResolutionComposite(resolved)).toBe(false);
  });

  it("is false when a raster layer's tiles have no real persisted data", () => {
    const resolved = [{ id: 1, layerType: 1, effectiveOpacity: 1, tiles: { ...supportedTiles, hasRealData: false } }];
    expect(canUseFullResolutionComposite(resolved)).toBe(false);
  });

  it("is false when a raster layer uses an unrecognized packing type", () => {
    const resolved = [{ id: 1, layerType: 1, effectiveOpacity: 1, tiles: { ...supportedTiles, packingType: [1, 1] as const } }];
    expect(canUseFullResolutionComposite(resolved)).toBe(false);
  });

  it("ignores the auto-generated Storyinformation layer type", () => {
    const resolved = [{ id: 1, layerType: 800, effectiveOpacity: 1, tiles: null }];
    expect(canUseFullResolutionComposite(resolved)).toBe(true);
  });
});
