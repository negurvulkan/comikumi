import zlib from "node:zlib";
import { createCanvas, ImageData, type SKRSContext2D } from "@napi-rs/canvas";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

/**
 * Imports Clip Studio Paint (.clip) files as a flattened page image. .clip is a
 * proprietary, non-officially-documented container format — the byte layouts and
 * SQLite schema below were independently reverse-engineered this session against real
 * files created in CSP and public parser-test fixtures
 * (github.com/LavenderSnek/clipdecode's assets/*.clip), cross-checked against the
 * format notes in github.com/Inochi2D/clip-d's SPEC.md and the source of
 * github.com/LavenderSnek/clipdecode and github.com/dobrokot/clip_to_psd (read as
 * reference documentation only, not copied — see docs/clip-parser-provenance.md for the
 * full research trail and license notes).
 *
 * Two extraction strategies, chosen automatically per page:
 *
 * - **"full"**: composite every visible layer's own raw tile pixel data at the
 *   canvas's real resolution. Only used when every visible layer is a plain raster/
 *   paper layer whose tiles use the verified `packing_type (1, 4)` pixel encoding (one
 *   leading 256x256 alpha plane + a 256x256 interleaved BGR-plus-padding block per
 *   tile) — live-verified pixel-exact against a solid color fill and a smooth
 *   black-to-white gradient (no seams, no banding). Other tile encodings exist (at
 *   least one real file used a `(1, 1)` packing not covered by any available reference
 *   implementation either) and are deliberately not guessed at — see
 *   canUseFullResolutionComposite.
 * - **"preview"**: extract CSP's own embedded `CanvasPreview` PNG — always present,
 *   used whenever "full" isn't possible (an unsupported layer type — vector/3D/
 *   gradient/tone/text/etc — an unrecognized tile packing, or a layer whose tiles were
 *   never actually persisted, which CSP was observed to do even for genuinely raster
 *   layers). Capped at roughly half the canvas's linear resolution in practice.
 */

const TILE_SIZE = 256;
const TILE_PIXEL_COUNT = TILE_SIZE * TILE_SIZE;

const CANVAS_UNIT_PIXELS = 0;
const CANVAS_UNIT_CENTIMETRES = 1;
const CANVAS_UNIT_MILLIMETRES = 2;
const CANVAS_UNIT_INCHES = 3;
const CANVAS_UNIT_POINTS = 5;

/** LayerKind values relevant here (clipdecode's LayerKind enum). */
const LAYER_TYPE_RASTER = 1;
const LAYER_TYPE_RASTER_MASKED = 3;
const LAYER_TYPE_PAPER = 1584;
/** CSP's auto-generated page-footer overlay (title/author/page-number, driven by the
 * Canvas table's ComicStory* columns) — not user-drawn artwork, and CSP's own dynamic
 * text-substitution rules for it aren't reproducible here. Observed as a visible layer
 * in effectively every real CSP page, so treating it like any other unsupported layer
 * type would force the preview fallback on nearly every import; instead it's skipped
 * entirely (never blocks full-resolution compositing, never drawn). */
const LAYER_TYPE_STORY_INFO = 800;

/** The one tile pixel packing this module knows how to decode — live-verified pixel-
 * exact (see this module's doc comment). `attributesArrays[1]`/`[2]` from the
 * Offscreen.Attribute blob's "Parameter" section together form this tuple; any other
 * combination falls back to the preview strategy rather than guessing. */
const SUPPORTED_PACKING_TYPE: readonly [number, number] = [1, 4];

function canvasDimsToPixels(value: number, unit: number, resolutionDpi: number): number {
  switch (unit) {
    case CANVAS_UNIT_PIXELS:
      return Math.round(value);
    case CANVAS_UNIT_CENTIMETRES:
      return Math.round((value / 2.54) * resolutionDpi);
    case CANVAS_UNIT_MILLIMETRES:
      return Math.round((value / 25.4) * resolutionDpi);
    case CANVAS_UNIT_INCHES:
      return Math.round(value * resolutionDpi);
    case CANVAS_UNIT_POINTS:
      return Math.round((value / 72) * resolutionDpi);
    default:
      return Math.round(value);
  }
}

// ---------------------------------------------------------------------------
// Chunk container parsing (CSFCHUNK -> CHNKHead -> CHNKSQLi / CHNKExta)
// ---------------------------------------------------------------------------

/** Reads CSFCHUNK (at file start) -> CHNKHead -> CHNKSQLi, and returns the raw embedded
 * SQLite database. All three chunks are 8-byte-magic-prefixed, big-endian u64 fields;
 * CHNKHead/CHNKSQLi are found by following file-offset pointers, not by scanning
 * sequentially. */
export function parseClipChunks(buffer: Buffer): { sqliteBlob: Buffer } {
  if (buffer.length < 24 || buffer.toString("ascii", 0, 8) !== "CSFCHUNK") {
    throw new Error("not_a_clip_file");
  }
  const headChunkPos = Number(buffer.readBigUInt64BE(16));
  if (headChunkPos + 8 > buffer.length || buffer.toString("ascii", headChunkPos, headChunkPos + 8) !== "CHNKHead") {
    throw new Error("invalid_clip_head_chunk");
  }
  // CHNKHead: magic(8) + size(8) + v256(8) + sqlite_chunk_pos(8) + guid_size(8) + guid(16)
  const sqliteChunkPos = Number(buffer.readBigUInt64BE(headChunkPos + 24));
  if (sqliteChunkPos + 16 > buffer.length || buffer.toString("ascii", sqliteChunkPos, sqliteChunkPos + 8) !== "CHNKSQLi") {
    throw new Error("invalid_clip_sqlite_chunk");
  }
  const bodySize = Number(buffer.readBigUInt64BE(sqliteChunkPos + 8));
  const bodyStart = sqliteChunkPos + 16;
  return { sqliteBlob: buffer.subarray(bodyStart, bodyStart + bodySize) };
}

/** Reads one CHNKExta chunk at a known file offset (found via the SQLite ExternalChunk
 * table's Offset column — CHNKExta chunks are not discoverable by sequential scanning).
 * Layout: magic(8) + size(8, unused) + ext_id_len(8, always 40) + ext_id(40) +
 * body_size(8) + body. */
export function readExtaChunk(buffer: Buffer, offset: number): { extId: string; body: Buffer } {
  if (offset + 72 > buffer.length || buffer.toString("ascii", offset, offset + 8) !== "CHNKExta") {
    throw new Error("invalid_exta_chunk");
  }
  const extIdLen = Number(buffer.readBigUInt64BE(offset + 16));
  if (extIdLen !== 40) throw new Error("unexpected_ext_id_length");
  const extId = buffer.toString("ascii", offset + 24, offset + 64);
  const bodySize = Number(buffer.readBigUInt64BE(offset + 64));
  const bodyStart = offset + 72;
  return { extId, body: buffer.subarray(bodyStart, bodyStart + bodySize) };
}

/** Decodes a big-endian-UTF16 length-prefixed tag (4-byte BE char count + that many
 * UTF-16BE code units) without mutating the source buffer. */
function decodeUtf16BeTag(buf: Buffer, pos: number): { text: string; byteLength: number } {
  const charCount = buf.readUInt32BE(pos);
  const byteLength = 4 + charCount * 2;
  const raw = Buffer.from(buf.subarray(pos + 4, pos + byteLength));
  raw.swap16();
  return { text: raw.toString("utf16le"), byteLength };
}

/** Walks a CHNKExta body's list of BlockDataChunks (one per 256x256 tile, in row-major
 * order over the layer's tile grid), returning each tile's raw zlib-compressed bytes,
 * or null for a tile with no data_flag (blank/never-painted). Always jumps to the next
 * chunk via its own 4-byte BE total-length prefix (which includes itself) rather than
 * accumulating inner field offsets — the length prefix is the one field guaranteed
 * correct regardless of how well any inner field is understood. Stops (returns what it
 * has) as soon as a differently-tagged chunk (BlockStatus/BlockCheckSum, which follow
 * the block list) is encountered. */
export function parseBlockDataChunks(body: Buffer): (Buffer | null)[] {
  const blocks: (Buffer | null)[] = [];
  let pos = 0;
  const n = body.length;
  while (pos < n) {
    if (n - pos < 8) break;
    const chunkSize = body.readUInt32BE(pos);
    if (chunkSize <= 0 || pos + chunkSize > n) break;
    const tagCharCount = body.readUInt32BE(pos + 4);
    if (tagCharCount > 64) break;
    const { text: tag, byteLength: tagByteLength } = decodeUtf16BeTag(body, pos + 4);
    if (tag !== "BlockDataBeginChunk") break;

    const dataFlagPos = pos + 4 + tagByteLength + 16;
    const dataFlag = body.readUInt32BE(dataFlagPos);
    let compressed: Buffer | null = null;
    if (dataFlag === 1) {
      // 4-byte BE inner size (excludes itself), then a 4-byte LE compressed-data length
      // (little-endian for this one field only — verified against real output).
      const dataSizePos = dataFlagPos + 8;
      const dataSize = body.readUInt32LE(dataSizePos);
      const dataStart = dataSizePos + 4;
      compressed = body.subarray(dataStart, dataStart + dataSize);
    }
    blocks.push(compressed);
    pos += chunkSize;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Offscreen.Attribute parsing (tile grid size + pixel packing type)
// ---------------------------------------------------------------------------

interface OffscreenAttributes {
  bitmapWidth: number;
  bitmapHeight: number;
  tileCols: number;
  tileRows: number;
  packingType: readonly [number, number];
}

/** Parses the Offscreen.Attribute BLOB's "Parameter" section: header(16) +
 * info_section_size(4) + extra_info_section_size(4) + unused(4) + "Parameter" tag(22,
 * fixed — 9 UTF16BE chars) + bitmapWidth(4) + bitmapHeight(4) + tileCols(4) +
 * tileRows(4) + a 16-int attributesArrays block, whose elements [1]/[2] form the tile's
 * pixel-packing type. All byte offsets verified against real Offscreen.Attribute blobs
 * (cross-checked with github.com/dobrokot/clip_to_psd's independent reverse-engineering
 * of the same structure). Tile grid size is read directly from the file, not computed
 * as ceil(dimension/256) — the two happened to match in every file tested, but aren't
 * guaranteed to. */
function parseOffscreenAttributes(attr: Buffer): OffscreenAttributes {
  if (attr.length < 118) throw new Error("offscreen_attribute_too_short");
  const { text: tag, byteLength: tagByteLength } = decodeUtf16BeTag(attr, 16);
  if (tag !== "Parameter") throw new Error("offscreen_attribute_missing_parameter_tag");
  let pos = 16 + tagByteLength;
  const bitmapWidth = attr.readUInt32BE(pos);
  const bitmapHeight = attr.readUInt32BE(pos + 4);
  const tileCols = attr.readUInt32BE(pos + 8);
  const tileRows = attr.readUInt32BE(pos + 12);
  pos += 16;
  const packingType: [number, number] = [attr.readUInt32BE(pos + 4), attr.readUInt32BE(pos + 8)];
  return { bitmapWidth, bitmapHeight, tileCols, tileRows, packingType };
}

// ---------------------------------------------------------------------------
// Pixel tile decoding — packing_type (1, 4) only (see this module's doc comment)
// ---------------------------------------------------------------------------

/** Decodes one inflated (1,4)-packed tile into RGBA bytes suitable for a canvas
 * ImageData: a leading 256x256 8-bit alpha plane, followed by a 256x256 block of
 * interleaved (B, G, R, unused) bytes. Live-verified pixel-exact against a solid red
 * fill and a smooth black-to-white gradient (see docs/clip-parser-provenance.md) — no
 * other packing type is supported, callers must check first (see
 * canUseFullResolutionComposite). */
export function decodePackedTile14(inflated: Buffer): Uint8ClampedArray {
  const expected = 5 * TILE_PIXEL_COUNT;
  if (inflated.length !== expected) {
    throw new Error(`unexpected_tile_size: expected ${expected}, got ${inflated.length}`);
  }
  const alpha = inflated.subarray(0, TILE_PIXEL_COUNT);
  const bgrx = inflated.subarray(TILE_PIXEL_COUNT, expected);
  const out = new Uint8ClampedArray(TILE_PIXEL_COUNT * 4);
  for (let p = 0; p < TILE_PIXEL_COUNT; p++) {
    out[p * 4] = bgrx[p * 4 + 2]; // R
    out[p * 4 + 1] = bgrx[p * 4 + 1]; // G
    out[p * 4 + 2] = bgrx[p * 4]; // B
    out[p * 4 + 3] = alpha[p]; // A
  }
  return out;
}

// ---------------------------------------------------------------------------
// SQLite document reading
// ---------------------------------------------------------------------------

export interface ClipLayer {
  id: number;
  name: string;
  layerType: number;
  visible: boolean;
  /** 0-256, CSP's own opacity scale (not 0-255). */
  opacity: number;
  nextIndex: number | null;
  firstChildIndex: number | null;
}

export interface ClipCanvasInfo {
  widthPx: number;
  heightPx: number;
  rootFolderId: number;
}

export interface ClipOffscreenTiles {
  tileCols: number;
  tileRows: number;
  packingType: readonly [number, number];
  hasRealData: boolean;
  /** Row-major, length === tileCols * tileRows when present. */
  tiles: (Buffer | null)[];
}

export interface ClipDocument {
  canvas: ClipCanvasInfo;
  layers: ClipLayer[];
  previewPng: Buffer;
  previewWidth: number;
  previewHeight: number;
  /** Resolves a layer's actual rendered tile data via LayerRenderMipmap ->
   * Mipmap.BaseMipmapInfo -> MipmapInfo.Offscreen -> Offscreen.BlockData ->
   * ExternalChunk.Offset -> CHNKExta. Returns null if the layer has no render mipmap,
   * or its Offscreen row's block data chunk isn't present in this file at all (not
   * just empty — genuinely absent). */
  getLayerTiles(layerId: number): ClipOffscreenTiles | null;
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
function loadSqlJs(): Promise<SqlJsStatic> {
  sqlJsPromise ??= initSqlJs();
  return sqlJsPromise;
}

function queryAll(db: Database, sql: string, params: (string | number)[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function queryOne(db: Database, sql: string, params: (string | number)[] = []): Record<string, unknown> | undefined {
  return queryAll(db, sql, params)[0];
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error("expected_blob_value");
}

export async function readClipDocument(buffer: Buffer): Promise<ClipDocument> {
  const { sqliteBlob } = parseClipChunks(buffer);
  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(sqliteBlob));

  const canvasRow = queryOne(db, "SELECT CanvasWidth, CanvasHeight, CanvasUnit, CanvasResolution, CanvasRootFolder FROM Canvas LIMIT 1");
  if (!canvasRow) {
    db.close();
    throw new Error("clip_missing_canvas");
  }
  const resolutionDpi = Number(canvasRow.CanvasResolution) || 350;
  const widthPx = canvasDimsToPixels(Number(canvasRow.CanvasWidth), Number(canvasRow.CanvasUnit), resolutionDpi);
  const heightPx = canvasDimsToPixels(Number(canvasRow.CanvasHeight), Number(canvasRow.CanvasUnit), resolutionDpi);

  const layerRows = queryAll(
    db,
    "SELECT MainId, LayerName, LayerType, LayerVisibility, LayerOpacity, LayerNextIndex, LayerFirstChildIndex FROM Layer"
  );
  const layers: ClipLayer[] = layerRows.map((r) => ({
    id: Number(r.MainId),
    name: typeof r.LayerName === "string" ? r.LayerName : "",
    layerType: Number(r.LayerType),
    // LayerVisibility is a bitmask, not a plain boolean flag — bit 0 is the actual
    // show/hide toggle (observed real value 3 = bits 0+1 set, still visible; a strict
    // "=== 1" equality check wrongly treated that as hidden and silently dropped its
    // entire layer subtree). Other bits' meaning is undocumented and not needed here.
    visible: (Number(r.LayerVisibility) & 1) === 1,
    opacity: Number(r.LayerOpacity),
    nextIndex: r.LayerNextIndex ? Number(r.LayerNextIndex) : null,
    firstChildIndex: r.LayerFirstChildIndex ? Number(r.LayerFirstChildIndex) : null,
  }));

  const previewRow = queryOne(db, "SELECT ImageWidth, ImageHeight, ImageData FROM CanvasPreview LIMIT 1");
  if (!previewRow) {
    db.close();
    throw new Error("clip_missing_preview");
  }
  const previewPng = toBuffer(previewRow.ImageData);
  const previewWidth = Number(previewRow.ImageWidth);
  const previewHeight = Number(previewRow.ImageHeight);

  const externalOffsets = new Map<string, number>();
  for (const row of queryAll(db, "SELECT ExternalID, Offset FROM ExternalChunk")) {
    const id = typeof row.ExternalID === "string" ? row.ExternalID : toBuffer(row.ExternalID).toString("ascii");
    externalOffsets.set(id, Number(row.Offset));
  }

  function getLayerTiles(layerId: number): ClipOffscreenTiles | null {
    const layerRow = queryOne(db, "SELECT LayerRenderMipmap FROM Layer WHERE MainId=?", [layerId]);
    const renderMipmapId = layerRow?.LayerRenderMipmap ? Number(layerRow.LayerRenderMipmap) : null;
    if (!renderMipmapId) return null;
    const mipmapRow = queryOne(db, "SELECT BaseMipmapInfo FROM Mipmap WHERE MainId=?", [renderMipmapId]);
    const baseInfoId = mipmapRow?.BaseMipmapInfo ? Number(mipmapRow.BaseMipmapInfo) : null;
    if (!baseInfoId) return null;
    const infoRow = queryOne(db, "SELECT Offscreen FROM MipmapInfo WHERE MainId=?", [baseInfoId]);
    const offscreenId = infoRow?.Offscreen ? Number(infoRow.Offscreen) : null;
    if (!offscreenId) return null;
    const offscreenRow = queryOne(db, "SELECT Attribute, BlockData FROM Offscreen WHERE MainId=?", [offscreenId]);
    if (!offscreenRow) return null;

    let attrs: OffscreenAttributes;
    try {
      attrs = parseOffscreenAttributes(toBuffer(offscreenRow.Attribute));
    } catch {
      return null;
    }

    const blockDataId =
      typeof offscreenRow.BlockData === "string" ? offscreenRow.BlockData : toBuffer(offscreenRow.BlockData).toString("ascii");
    const chunkOffset = externalOffsets.get(blockDataId);
    if (chunkOffset === undefined) return null;

    const { body } = readExtaChunk(buffer, chunkOffset);
    const tiles = parseBlockDataChunks(body);
    const hasRealData = tiles.some((t) => t !== null);
    return { tileCols: attrs.tileCols, tileRows: attrs.tileRows, packingType: attrs.packingType, hasRealData, tiles };
  }

  return {
    canvas: { widthPx, heightPx, rootFolderId: Number(canvasRow.CanvasRootFolder) },
    layers,
    previewPng,
    previewWidth,
    previewHeight,
    getLayerTiles,
  };
}

// ---------------------------------------------------------------------------
// Layer tree resolution
// ---------------------------------------------------------------------------

export interface ResolvedLayer {
  id: number;
  layerType: number;
  /** 0-1, already multiplied through any ancestor folders' own opacity. */
  effectiveOpacity: number;
}

/** Walks the layer tree from the canvas's root folder (LayerFolder parent-chain,
 * represented as sibling/child linked lists via LayerNextIndex/LayerFirstChildIndex),
 * propagating visibility and opacity down through folders, and returns only the
 * paintable leaf layers (folders themselves are containers, not drawn) in traversal
 * order. A hidden folder hides everything inside it regardless of each child's own
 * visibility flag. */
export function resolveEffectiveLayerVisibility(layers: ClipLayer[], rootFolderId: number): ResolvedLayer[] {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const result: ResolvedLayer[] = [];

  function walk(layerId: number, inheritedVisible: boolean, inheritedOpacity: number): void {
    const layer = byId.get(layerId);
    if (!layer) return;
    const visible = inheritedVisible && layer.visible;
    const opacity = inheritedOpacity * (layer.opacity / 256);
    if (layer.firstChildIndex) {
      walk(layer.firstChildIndex, visible, opacity);
    } else if (visible) {
      result.push({ id: layer.id, layerType: layer.layerType, effectiveOpacity: opacity });
    }
    if (layer.nextIndex) walk(layer.nextIndex, inheritedVisible, inheritedOpacity);
  }

  const root = byId.get(rootFolderId);
  if (root?.firstChildIndex) walk(root.firstChildIndex, true, 1);
  return result;
}

// ---------------------------------------------------------------------------
// Strategy A/B decision + top-level flatten
// ---------------------------------------------------------------------------

interface ResolvedLayerWithTiles extends ResolvedLayer {
  tiles: ClipOffscreenTiles | null;
}

function isSupportedPacking(packingType: readonly [number, number]): boolean {
  return packingType[0] === SUPPORTED_PACKING_TYPE[0] && packingType[1] === SUPPORTED_PACKING_TYPE[1];
}

/** True only if every visible layer is a plain raster/paper/story-info layer AND (for
 * raster layers) actually has persisted tile data using the one pixel packing this
 * module can decode. A layer with a supported LayerType but no real tile data, or an
 * unrecognized packing type, forces the same page-wide preview fallback as an
 * unsupported layer type (vector/3D/gradient/tone/text/etc) — so a page never ends up
 * with silently-missing or silently-miscolored content mixed into an otherwise
 * full-resolution composite. */
export function canUseFullResolutionComposite(resolved: ResolvedLayerWithTiles[]): boolean {
  return resolved.every((layer) => {
    if (layer.layerType === LAYER_TYPE_PAPER || layer.layerType === LAYER_TYPE_STORY_INFO) return true;
    if (layer.layerType !== LAYER_TYPE_RASTER && layer.layerType !== LAYER_TYPE_RASTER_MASKED) return false;
    const tiles = layer.tiles;
    return tiles?.hasRealData === true && isSupportedPacking(tiles.packingType);
  });
}

function drawTile(ctx: SKRSContext2D, compressed: Buffer, x: number, y: number, drawWidth: number, drawHeight: number): void {
  const inflated = zlib.inflateSync(compressed);
  const rgba = decodePackedTile14(inflated);
  const imageData = new ImageData(rgba, TILE_SIZE, TILE_SIZE);
  if (drawWidth === TILE_SIZE && drawHeight === TILE_SIZE) {
    ctx.putImageData(imageData, x, y);
    return;
  }
  // putImageData can't crop -- draw the full tile onto a throwaway canvas, then
  // drawImage() only the in-bounds portion for a tile straddling the canvas edge.
  const tmp = createCanvas(TILE_SIZE, TILE_SIZE);
  tmp.getContext("2d").putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, 0, 0, drawWidth, drawHeight, x, y, drawWidth, drawHeight);
}

/** Converts a .clip file buffer into a single flattened page PNG. See this module's
 * doc comment for the "full" vs "preview" strategy choice. */
export async function flattenClipToPng(buffer: Buffer): Promise<{ png: Buffer; quality: "full" | "preview" }> {
  const doc = await readClipDocument(buffer);
  const resolved: ResolvedLayerWithTiles[] = resolveEffectiveLayerVisibility(doc.layers, doc.canvas.rootFolderId).map((layer) => ({
    ...layer,
    tiles: doc.getLayerTiles(layer.id),
  }));

  if (!canUseFullResolutionComposite(resolved)) {
    return { png: doc.previewPng, quality: "preview" };
  }

  const canvas = createCanvas(doc.canvas.widthPx, doc.canvas.heightPx);
  const ctx = canvas.getContext("2d");
  for (const layer of resolved) {
    ctx.globalAlpha = layer.effectiveOpacity;
    if (layer.layerType === LAYER_TYPE_PAPER) {
      // CSP's paper layer is always a fixed white background (its actual per-file
      // InitColor value isn't decoded here — not needed, a paper layer is by
      // definition the opaque base every other layer composites over).
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, doc.canvas.widthPx, doc.canvas.heightPx);
      ctx.globalAlpha = 1;
      continue;
    }
    const tiles = layer.tiles;
    if (!tiles) continue;
    for (let i = 0; i < tiles.tiles.length; i++) {
      const compressed = tiles.tiles[i];
      if (!compressed) continue;
      const row = Math.floor(i / tiles.tileCols);
      const col = i % tiles.tileCols;
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      const drawWidth = Math.min(TILE_SIZE, doc.canvas.widthPx - x);
      const drawHeight = Math.min(TILE_SIZE, doc.canvas.heightPx - y);
      if (drawWidth <= 0 || drawHeight <= 0) continue;
      drawTile(ctx, compressed, x, y, drawWidth, drawHeight);
    }
    ctx.globalAlpha = 1;
  }
  return { png: canvas.toBuffer("image/png"), quality: "full" };
}
