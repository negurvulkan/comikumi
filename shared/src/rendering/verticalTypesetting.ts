import type { TextAlign, TextGradient, TextOutline } from "../layoutSchema.js";
import { MIN_FONT_SIZE } from "./textLayout.js";
import { applyTextFillStyle, drawStyledText, type TextFillStyle } from "./textEffects.js";
import { createOffscreenCanvas } from "./canvasFactory.js";

/**
 * Vertical (tategaki) Japanese typesetting — tokenizes text into the units
 * that vertical Japanese layout actually cares about (forced breaks, ruby/
 * furigana runs, tate-chū-yoko number/Latin runs, and individually-styled
 * characters), lays them into columns with basic kinsoku shori (line-breaking
 * rules), then draws them. Single source of truth shared by the live Konva
 * preview (BubbleShape.tsx), the PNG export (renderPageToPng.ts), the
 * perspective-warped quad text (perspective.ts), and the server-side
 * vector-PDF/PSD exporters (pageRaster.ts) — same pattern as
 * fitHorizontalText in textLayout.ts.
 */

export interface VerticalCharToken {
  kind: "char";
  text: string;
  /** ー、〜 and dash-like glyphs — drawn rotated 90° so they read as a
   *  vertical stroke instead of a horizontal dash sitting sideways. */
  rotate?: boolean;
  /** Small kana (っゃゅょ...) and 、。 — nudged toward the upper-right of
   *  their cell, approximating the dedicated vertical glyph variants real
   *  vertical-aware fonts have (which plain per-character ctx.fillText can't
   *  access, since that always draws the horizontal glyph). */
  smallOffset?: boolean;
  /** Small kana specifically (not 、。, which use smallOffset alone) — drawn
   *  ~25% smaller than surrounding characters, matching how real vertical
   *  fonts render sokuon/yōon glyphs noticeably reduced in size. */
  smallKana?: boolean;
}
export interface VerticalTcyToken {
  /** Tate-chū-yoko: a short (2-char) run of half-width digits/Latin letters
   *  drawn upright and side-by-side within a single column cell instead of
   *  being stacked character-by-character. */
  kind: "tcy";
  text: string;
}
export interface VerticalRubyToken {
  /** Furigana: `base` renders as normal stacked characters; `reading` renders
   *  smaller, offset to the right, spread evenly across the same vertical
   *  span the base run occupies. Authored inline as `{base|reading}`. */
  kind: "ruby";
  base: string;
  reading: string;
}
export interface VerticalRubyWordToken {
  /** 2+ directly consecutive mono-ruby pairs (each base exactly 1 character) kept
   *  together across a column break — e.g. authoring `{東|とう}{京|きょう}` instead of
   *  the group-ruby form `{東京|とうきょう}`. Each pair still renders individually,
   *  positioned right beside just its own base character (see drawRubyToken); only the
   *  column-fill bookkeeping treats the run as one unbreakable word, same idea as
   *  VerticalWordToken for plain kanji/katakana runs. Produced by groupMonoRuby() as a
   *  post-process over the token stream — a single, isolated mono-ruby pair (no
   *  adjacent one) stays a plain "ruby" token. */
  kind: "rubyWord";
  pairs: { base: string; reading: string }[];
}
export interface VerticalBreakToken {
  /** An explicit `\n` in the source text — forces a new column instead of
   *  being silently dropped (the previous behavior). */
  kind: "break";
}
export interface VerticalWordToken {
  /** An atomic run of ≥2 consecutive katakana (names/loanwords) or kanji
   *  (compound nouns) characters — kept together across a column break
   *  instead of splitting mid-word (e.g. "ケイト" breaking into "ケイ"/"ト").
   *  Each character still renders individually exactly like a plain char
   *  token (including its own rotate/smallOffset flags, e.g. a ー inside a
   *  katakana word); only the column-fill bookkeeping treats the run as one
   *  unit, same idea as tcy/ruby atomicity. */
  kind: "word";
  chars: VerticalCharToken[];
}
export type VerticalToken = VerticalCharToken | VerticalTcyToken | VerticalRubyToken | VerticalRubyWordToken | VerticalBreakToken | VerticalWordToken;

// Dash-like glyphs (rotated so a horizontal stroke reads as vertical) plus
// colon/semicolon (rotated 90° so their two dots sit side-by-side on the
// column's center axis instead of stacked like a horizontal colon) plus
// ellipsis/two-dot-leader glyphs (rotated 90° so their dots stack vertically
// instead of running left-to-right across the column).
const ROTATE_CHARS = new Set([
  "ー", "〜", "~", "-", "—", "–", "―", "ｰ", "：", "；", ":", ";",
  "…", "‥", "⋯",
]);

const SMALL_KANA_CHARS = new Set([
  "っ", "ゃ", "ゅ", "ょ", "ゎ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ",
  "ッ", "ャ", "ュ", "ョ", "ヮ", "ァ", "ィ", "ゥ", "ェ", "ォ",
]);

const SMALL_OFFSET_CHARS = new Set([...SMALL_KANA_CHARS, "、", "。"]);

/** Characters that must never start a column (行頭禁則). */
const LEADING_PROHIBITED = new Set([
  ...SMALL_OFFSET_CHARS,
  "ー", "」", "』", "）", "］", "｝", "〉", "》", "’", "”", "・", "：", "；", "？", "！", "，", "．",
]);

/** Characters that must never end a column (行末禁則). */
const TRAILING_PROHIBITED = new Set(["「", "『", "（", "［", "｛", "〈", "《", "‘", "“"]);

const TCY_MAX_LEN = 2;
const ALNUM_RE = /[0-9A-Za-z]/;
// Fullwidth ！/？ — paired as a compact tate-chū-yoko unit (！？, ！！, ？？)
// exactly like a 2-digit number run; a single ！ or ？ falls through to the
// normal full-width upright char case below.
const EXCLAIM_Q_RE = /[！？]/;
// U+30FC (ー) sits inside the katakana block, so long-vowel marks inside a
// katakana word (e.g. コーヒー) naturally stay part of the same atomic run.
const KATAKANA_RE = /[ァ-ー]/;
const KANJI_RE = /[一-鿿]/;

/**
 * Unicode has dedicated "vertical forms" codepoints for common CJK
 * punctuation — glyphs pre-drawn in their correct vertical-typesetting
 * position (e.g. 、's comma sits upper-right instead of lower-left). Most CJK
 * fonts ship real glyphs for these (verified by pixel-probing every font
 * registered in this project — see probeVerticalGlyphSupport below), so a
 * plain codepoint swap before fillText gets proper vertical punctuation
 * without any rendering-pipeline change. Falls back to the manual
 * upper-right nudge (smallOffset) for any font that turns out not to have
 * these glyphs mapped.
 */
const VERTICAL_FORM_MAP: Record<string, string> = {
  "、": "︑",
  "。": "︒",
  "「": "﹁",
  "」": "﹂",
  "『": "﹃",
  "』": "﹄",
  "（": "︵",
  "）": "︶",
};

const verticalGlyphSupportCache = new Map<string, boolean>();

/** Renders `ch` in `fontFamily` and returns its ink bounding box (null if nothing painted). */
function measureInkBBox(fontFamily: string, ch: string): { w: number; h: number } | null {
  const size = 64;
  const probeCanvas = createOffscreenCanvas(size, size);
  const pctx = probeCanvas.getContext("2d")!;
  pctx.font = `${Math.round(size * 0.8)}px "${fontFamily}"`;
  pctx.textBaseline = "middle";
  pctx.textAlign = "center";
  pctx.fillStyle = "#000";
  pctx.fillText(ch, size / 2, size / 2);
  const data = pctx.getImageData(0, 0, size, size).data;
  let minX = size, maxX = 0, minY = size, maxY = 0, any = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] > 10) {
        any = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return any ? { w: maxX - minX, h: maxY - minY } : null;
}

/**
 * One-time-per-font check (cached) for whether `fontFamily` has a real,
 * sensibly-sized glyph for the vertical-form punctuation codepoints, using
 * 、/︑ as the representative pair — a font either ships this whole
 * compatibility block or none of it, so one probe covers the group. A
 * missing glyph typically renders as a wildly different-sized fallback/tofu
 * box, which the width/height ratio check below rejects.
 */
function hasVerticalFormGlyphs(fontFamily: string): boolean {
  const cached = verticalGlyphSupportCache.get(fontFamily);
  if (cached !== undefined) return cached;
  let supported = false;
  try {
    const ref = measureInkBBox(fontFamily, "、");
    const sub = measureInkBBox(fontFamily, VERTICAL_FORM_MAP["、"]);
    if (ref && sub) {
      const wRatio = sub.w / ref.w;
      const hRatio = sub.h / ref.h;
      supported = wRatio > 0.4 && wRatio < 2.5 && hRatio > 0.4 && hRatio < 2.5;
    }
  } catch {
    supported = false;
  }
  verticalGlyphSupportCache.set(fontFamily, supported);
  return supported;
}

function charToken(ch: string): VerticalCharToken {
  return {
    kind: "char",
    text: ch,
    rotate: ROTATE_CHARS.has(ch) || undefined,
    smallOffset: SMALL_OFFSET_CHARS.has(ch) || undefined,
    smallKana: SMALL_KANA_CHARS.has(ch) || undefined,
  };
}

/** Splits raw bubble text into vertical-typesetting tokens (see VerticalToken). */
export function tokenizeVertical(text: string): VerticalToken[] {
  const tokens: VerticalToken[] = [];
  const chars = [...text];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];

    if (ch === "\n") {
      tokens.push({ kind: "break" });
      i++;
      continue;
    }

    if (ch === "{") {
      const rest = chars.slice(i).join("");
      const match = rest.match(/^\{([^{}|]+)\|([^{}]+)\}/);
      if (match) {
        tokens.push({ kind: "ruby", base: match[1], reading: match[2] });
        i += [...match[0]].length;
        continue;
      }
    }

    if (ALNUM_RE.test(ch)) {
      let run = ch;
      let j = i + 1;
      while (j < chars.length && run.length < TCY_MAX_LEN && ALNUM_RE.test(chars[j])) {
        run += chars[j];
        j++;
      }
      if (run.length === TCY_MAX_LEN) {
        tokens.push({ kind: "tcy", text: run });
        i = j;
        continue;
      }
      tokens.push({ kind: "char", text: ch });
      i++;
      continue;
    }

    if (EXCLAIM_Q_RE.test(ch)) {
      let run = ch;
      let j = i + 1;
      while (j < chars.length && run.length < TCY_MAX_LEN && EXCLAIM_Q_RE.test(chars[j])) {
        run += chars[j];
        j++;
      }
      if (run.length === TCY_MAX_LEN) {
        tokens.push({ kind: "tcy", text: run });
        i = j;
        continue;
      }
      tokens.push(charToken(ch));
      i++;
      continue;
    }

    if (KANJI_RE.test(ch) || KATAKANA_RE.test(ch)) {
      const isKatakana = KATAKANA_RE.test(ch);
      const scriptRe = isKatakana ? KATAKANA_RE : KANJI_RE;
      let j = i + 1;
      while (j < chars.length && scriptRe.test(chars[j])) j++;
      const runChars = chars.slice(i, j);
      if (runChars.length >= 2) {
        tokens.push({ kind: "word", chars: runChars.map(charToken) });
      } else {
        tokens.push(charToken(ch));
      }
      i = j;
      continue;
    }

    tokens.push(charToken(ch));
    i++;
  }
  return groupMonoRuby(tokens);
}

/** Merges runs of 2+ directly consecutive single-character-base ruby tokens into one
 *  atomic VerticalRubyWordToken (see its doc comment) — purely a column-break-safety
 *  grouping, the individual pairs still render exactly as before. */
function groupMonoRuby(tokens: VerticalToken[]): VerticalToken[] {
  const result: VerticalToken[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "ruby" && [...t.base].length === 1) {
      const pairs: { base: string; reading: string }[] = [{ base: t.base, reading: t.reading }];
      let j = i + 1;
      while (j < tokens.length) {
        const next = tokens[j];
        if (next.kind === "ruby" && [...next.base].length === 1) {
          pairs.push({ base: next.base, reading: next.reading });
          j++;
        } else {
          break;
        }
      }
      if (pairs.length >= 2) {
        result.push({ kind: "rubyWord", pairs });
      } else {
        result.push(t);
      }
      i = j;
      continue;
    }
    result.push(t);
    i++;
  }
  return result;
}

/** How many column "rows" a token occupies — a ruby run occupies one row per base character. */
function tokenWeight(token: VerticalToken): number {
  if (token.kind === "break") return 0;
  if (token.kind === "ruby") return [...token.base].length;
  if (token.kind === "rubyWord") return token.pairs.length;
  if (token.kind === "word") return token.chars.length;
  return 1;
}

function isLeadingProhibited(token: VerticalToken): boolean {
  return token.kind === "char" && LEADING_PROHIBITED.has(token.text);
}

function isTrailingProhibited(token: VerticalToken): boolean {
  return token.kind === "char" && TRAILING_PROHIBITED.has(token.text);
}

function layoutColumnsGreedy(tokens: VerticalToken[], maxRowsPerColumn: number): VerticalToken[][] {
  const columns: VerticalToken[][] = [];
  let current: VerticalToken[] = [];
  let currentWeight = 0;
  for (const token of tokens) {
    if (token.kind === "break") {
      columns.push(current);
      current = [];
      currentWeight = 0;
      continue;
    }
    const weight = tokenWeight(token);
    if (currentWeight > 0 && currentWeight + weight > maxRowsPerColumn) {
      columns.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(token);
    currentWeight += weight;
  }
  columns.push(current);
  return columns.filter((c) => c.length > 0);
}

/**
 * Basic kinsoku shori (禁則処理): pulls a prohibited leading character back
 * into the previous column, and pushes a prohibited trailing character
 * forward into the next — a simplified "oidashi" pass (columns may grow by a
 * token or two rather than perfectly respecting maxRowsPerColumn, the same
 * practical tradeoff most non-professional typesetting tools make).
 */
function applyKinsoku(columns: VerticalToken[][]): VerticalToken[][] {
  for (let i = 0; i < columns.length - 1; i++) {
    let guard = 0;
    while (columns[i + 1].length > 0 && isLeadingProhibited(columns[i + 1][0]) && guard < 4) {
      columns[i].push(columns[i + 1].shift()!);
      guard++;
    }
    guard = 0;
    while (columns[i].length > 0 && isTrailingProhibited(columns[i][columns[i].length - 1]) && guard < 4) {
      columns[i + 1].unshift(columns[i].pop()!);
      guard++;
    }
  }
  return columns.filter((c) => c.length > 0);
}

export interface VerticalFitResult {
  fontSize: number;
  columns: VerticalToken[][];
  /** Vertical spacing between rows within a column. */
  rowStep: number;
  /** Horizontal spacing between columns — wider than rowStep when the text contains ruby, to leave room for the furigana. */
  colPitch: number;
  blockWidth: number;
}

/**
 * Shrinks fontSize (down to MIN_FONT_SIZE) until the tokenized, column-wrapped
 * text fits within boxWidth x boxHeight — shared by the live editor preview,
 * the PNG export and perspective-warped quad text for vertical-rl bubbles.
 */
export function fitVerticalText(
  text: string,
  lineHeight: number,
  boxWidth: number,
  boxHeight: number,
  baseFontSize: number
): VerticalFitResult {
  const tokens = tokenizeVertical(text);
  const hasRuby = tokens.some((t) => t.kind === "ruby" || t.kind === "rubyWord");
  // Ruby needs room to the side of its base column for the reading — reserving
  // extra pitch uniformly for the whole block is far simpler than computing a
  // gap only next to columns that actually carry a ruby run, at the cost of
  // slightly looser spacing elsewhere when only some columns have furigana.
  const gapFactor = hasRuby ? 1.4 : 1;

  let size = baseFontSize;
  let columns: VerticalToken[][] = [];
  let rowStep = size * lineHeight;
  let colPitch = rowStep * gapFactor;
  while (size >= MIN_FONT_SIZE) {
    rowStep = size * lineHeight;
    colPitch = rowStep * gapFactor;
    const maxRowsPerColumn = Math.max(1, Math.floor(boxHeight / rowStep));
    columns = applyKinsoku(layoutColumnsGreedy(tokens, maxRowsPerColumn));
    const blockWidth = columns.length * colPitch;
    if (blockWidth <= boxWidth || size === MIN_FONT_SIZE) break;
    size -= 1;
  }
  return { fontSize: size, columns, rowStep, colPitch, blockWidth: columns.length * colPitch };
}

export interface DrawVerticalTextOptions {
  fontFamily: string;
  color: string;
  /** Where the column block sits within boxWidth — "right" hugs the box's
   *  right edge (where reading naturally starts), "left" the opposite edge,
   *  "center" (default) centers the block. Previously always centered
   *  regardless of this setting. */
  align?: TextAlign;
  outline?: TextOutline;
  gradient?: TextGradient;
  /** Same scale factor the caller used for rowStep/colPitch — sizes the outline stroke consistently (1 for export's real image px, the display zoom factor for the editor preview). */
  scale?: number;
}

/** Draws one char token at (x, y) — applying its rotate/smallOffset/smallKana flags, or the real vertical-form glyph when the font has one — shared by the plain "char" case and each character inside a "word" run. `fontSize` is the column's base size; smallKana temporarily shrinks ctx.font and restores it before returning, so callers can keep reusing the same font across a run without resetting it themselves. */
function drawCharToken(
  ctx: CanvasRenderingContext2D,
  token: VerticalCharToken,
  x: number,
  y: number,
  rowStep: number,
  fontSize: number,
  opts: DrawVerticalTextOptions,
  style: TextFillStyle
) {
  if (token.smallKana) {
    ctx.font = `${fontSize * 0.75}px "${opts.fontFamily}"`;
  }
  const verticalForm = VERTICAL_FORM_MAP[token.text];
  if (verticalForm && hasVerticalFormGlyphs(opts.fontFamily)) {
    drawStyledText(ctx, verticalForm, x, y, style);
  } else if (token.rotate) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2);
    drawStyledText(ctx, token.text, 0, 0, style);
    ctx.restore();
  } else if (token.smallOffset) {
    drawStyledText(ctx, token.text, x + rowStep * 0.18, y - rowStep * 0.18, style);
  } else {
    drawStyledText(ctx, token.text, x, y, style);
  }
  if (token.smallKana) {
    ctx.font = `${fontSize}px "${opts.fontFamily}"`;
  }
}

/**
 * Draws a fitted vertical-text layout centered at (originX, originY) within a
 * box of the given width — the one place all three renderers (Konva preview,
 * PNG export, perspective quad text) call into instead of each having their
 * own column-drawing loop. Sets ctx.font/fillStyle/textAlign/textBaseline
 * itself; caller only needs to have already ctx.save()'d if it wants to
 * restore surrounding state.
 */
export function drawVerticalText(
  ctx: CanvasRenderingContext2D,
  fitted: VerticalFitResult,
  originX: number,
  originY: number,
  boxWidth: number,
  opts: DrawVerticalTextOptions
) {
  const { fontSize, columns, rowStep, colPitch, blockWidth } = fitted;
  ctx.textBaseline = "middle";

  const align = opts.align ?? "center";
  const rightX =
    align === "left"
      ? originX - boxWidth / 2 + blockWidth - colPitch / 2
      : align === "right"
        ? originX + boxWidth / 2 - colPitch / 2
        : originX + blockWidth / 2 - colPitch / 2;

  // All columns share ONE vertical reference (the tallest column's height)
  // instead of each column centering around its own row count — otherwise
  // columns of different lengths (e.g. across a \n-separated sentence) drift
  // to different heights and the whole block looks ragged/uncentered.
  const maxRows = Math.max(1, ...columns.map((col) => col.reduce((sum, t) => sum + tokenWeight(t), 0)));
  const blockHeight = maxRows * rowStep;
  const yStart = originY - blockHeight / 2 + rowStep / 2;

  const style: TextFillStyle = { color: opts.color, outline: opts.outline, gradient: opts.gradient };
  // The gradient/outline must be set up ONCE for the whole block (same
  // reasoning as the block-shared vertical reference above) — the bbox is the
  // block's own extent, not the wider boxWidth it's centered/aligned within.
  applyTextFillStyle(ctx, style, rightX - blockWidth + colPitch, originY - blockHeight / 2, blockWidth, blockHeight, opts.scale ?? 1);

  columns.forEach((column, colIndex) => {
    const x = rightX - colIndex * colPitch;
    let y = yStart;

    for (const token of column) {
      if (token.kind === "char") {
        ctx.font = `${fontSize}px "${opts.fontFamily}"`;
        ctx.textAlign = "center";
        drawCharToken(ctx, token, x, y, rowStep, fontSize, opts, style);
        y += rowStep;
      } else if (token.kind === "word") {
        ctx.font = `${fontSize}px "${opts.fontFamily}"`;
        ctx.textAlign = "center";
        for (const charTok of token.chars) {
          drawCharToken(ctx, charTok, x, y, rowStep, fontSize, opts, style);
          y += rowStep;
        }
      } else if (token.kind === "tcy") {
        let tcySize = fontSize * 0.62;
        ctx.font = `${tcySize}px "${opts.fontFamily}"`;
        ctx.textAlign = "center";
        const measured = ctx.measureText(token.text).width;
        if (measured > rowStep * 0.98) {
          tcySize *= (rowStep * 0.98) / measured;
          ctx.font = `${tcySize}px "${opts.fontFamily}"`;
        }
        drawStyledText(ctx, token.text, x, y, style);
        y += rowStep;
      } else if (token.kind === "ruby") {
        y = drawRubyToken(ctx, token.base, token.reading, x, y, rowStep, colPitch, fontSize, opts, style);
      } else if (token.kind === "rubyWord") {
        for (const pair of token.pairs) {
          y = drawRubyToken(ctx, pair.base, pair.reading, x, y, rowStep, colPitch, fontSize, opts, style);
        }
      }
      // "break" tokens never appear inside a laid-out column.
    }
  });
}

/** Draws one ruby run (stacked base characters, reading spread evenly beside the whole
 *  base span) at (x, y) and returns the y position just past it — shared by the "ruby"
 *  token case (one run spanning the whole base string) and the "rubyWord" case (called
 *  once per mono-ruby pair, each with a 1-character base — see VerticalRubyWordToken). */
function drawRubyToken(
  ctx: CanvasRenderingContext2D,
  base: string,
  reading: string,
  x: number,
  y: number,
  rowStep: number,
  colPitch: number,
  fontSize: number,
  opts: DrawVerticalTextOptions,
  style: TextFillStyle
): number {
  const baseChars = [...base];
  const yStart = y;
  ctx.font = `${fontSize}px "${opts.fontFamily}"`;
  ctx.textAlign = "center";
  baseChars.forEach((ch) => {
    drawStyledText(ctx, ch, x, y, style);
    y += rowStep;
  });
  const baseSpanHeight = baseChars.length * rowStep;
  const readingChars = [...reading];
  const readingStep = baseSpanHeight / readingChars.length;
  ctx.font = `${fontSize * 0.5}px "${opts.fontFamily}"`;
  readingChars.forEach((ch, i) => {
    drawStyledText(ctx, ch, x + colPitch * 0.5, yStart + readingStep / 2 + i * readingStep, style);
  });
  return y;
}
