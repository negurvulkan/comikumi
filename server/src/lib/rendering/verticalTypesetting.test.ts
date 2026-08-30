import { describe, it, expect } from "vitest";
import { tokenizeVertical, fitVerticalText } from "../../../../shared/src/rendering/verticalTypesetting.js";

describe("tokenizeVertical", () => {
  it("tokenizes plain characters one-by-one", () => {
    const tokens = tokenizeVertical("あ");
    expect(tokens).toEqual([{ kind: "char", text: "あ", rotate: undefined, smallOffset: undefined, smallKana: undefined }]);
  });

  it("parses ruby/furigana syntax {base|reading}", () => {
    const tokens = tokenizeVertical("{漢字|かんじ}");
    expect(tokens).toEqual([{ kind: "ruby", base: "漢字", reading: "かんじ" }]);
  });

  it("groups 2+ consecutive single-character (mono-ruby) pairs into one rubyWord token", () => {
    const tokens = tokenizeVertical("{東|とう}{京|きょう}");
    expect(tokens).toEqual([
      { kind: "rubyWord", pairs: [{ base: "東", reading: "とう" }, { base: "京", reading: "きょう" }] },
    ]);
  });

  it("leaves a single, isolated mono-ruby pair as a plain ruby token", () => {
    const tokens = tokenizeVertical("{猫|ねこ}");
    expect(tokens).toEqual([{ kind: "ruby", base: "猫", reading: "ねこ" }]);
  });

  it("parses a single-character bōten emphasis marker {text*} as a char token with emphasis: true", () => {
    const tokens = tokenizeVertical("{猫*}");
    expect(tokens).toEqual([{ kind: "char", text: "猫", rotate: undefined, smallOffset: undefined, smallKana: undefined, emphasis: true }]);
  });

  it("parses a multi-character bōten emphasis marker {text*} as a word token with emphasis on every char", () => {
    const tokens = tokenizeVertical("{最悪*}");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe("word");
    if (tokens[0].kind === "word") {
      expect(tokens[0].chars.map((c) => c.text)).toEqual(["最", "悪"]);
      expect(tokens[0].chars.every((c) => c.emphasis)).toBe(true);
    }
  });

  it("does not group a group-ruby token (multi-character base) with a neighboring mono-ruby pair", () => {
    const tokens = tokenizeVertical("{東京|とうきょう}{猫|ねこ}");
    expect(tokens).toEqual([
      { kind: "ruby", base: "東京", reading: "とうきょう" },
      { kind: "ruby", base: "猫", reading: "ねこ" },
    ]);
  });

  it("turns an explicit newline into a break token", () => {
    const tokens = tokenizeVertical("a\nb");
    expect(tokens[1]).toEqual({ kind: "break" });
  });

  it("pairs exactly 2 consecutive alphanumeric characters into a tate-chu-yoko run", () => {
    expect(tokenizeVertical("12")).toEqual([{ kind: "tcy", text: "12" }]);
    // 3 digits: greedy 2-char run, then the leftover digit falls back to a plain char.
    expect(tokenizeVertical("123")).toEqual([{ kind: "tcy", text: "12" }, { kind: "char", text: "3" }]);
  });

  it("normalizes fullwidth digits/Latin (as produced by JP IMEs) to halfwidth before tate-chu-yoko pairing", () => {
    expect(tokenizeVertical("２１")).toEqual([{ kind: "tcy", text: "21" }]);
    expect(tokenizeVertical("Ｍ")).toEqual([{ kind: "char", text: "M" }]);
    // Mixed halfwidth + fullwidth run still pairs and normalizes both.
    expect(tokenizeVertical("2１")).toEqual([{ kind: "tcy", text: "21" }]);
  });

  it("a lone alphanumeric character (no pair available) stays a plain char token", () => {
    expect(tokenizeVertical("a")).toEqual([{ kind: "char", text: "a" }]);
  });

  it("groups 2+ consecutive kanji into a word token, leaves a single kanji as char", () => {
    const multi = tokenizeVertical("漢字");
    expect(multi).toHaveLength(1);
    expect(multi[0].kind).toBe("word");
    if (multi[0].kind === "word") expect(multi[0].chars.map((c) => c.text)).toEqual(["漢", "字"]);

    const single = tokenizeVertical("字");
    expect(single).toEqual([{ kind: "char", text: "字", rotate: undefined, smallOffset: undefined, smallKana: undefined }]);
  });

  it("groups 2+ consecutive katakana into a word token (e.g. a name/loanword)", () => {
    const tokens = tokenizeVertical("ケイト");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe("word");
  });

  it("marks dash-like glyphs (ー〜) for rotation", () => {
    const tokens = tokenizeVertical("ー");
    expect(tokens[0]).toMatchObject({ kind: "char", text: "ー", rotate: true });
  });

  it("marks small kana for smallOffset+smallKana, and 、。 for smallOffset only", () => {
    const small = tokenizeVertical("っ")[0];
    expect(small).toMatchObject({ smallOffset: true, smallKana: true });
    const punct = tokenizeVertical("、")[0];
    expect(punct).toMatchObject({ smallOffset: true, smallKana: undefined });
  });

  it("pairs fullwidth ！／？ into a tate-chu-yoko run just like digits", () => {
    expect(tokenizeVertical("！？")).toEqual([{ kind: "tcy", text: "！？" }]);
  });
});

describe("fitVerticalText", () => {
  it("keeps the base font size when the text fits comfortably", () => {
    const result = fitVerticalText("あ", 1.2, 500, 500, 24);
    expect(result.fontSize).toBe(24);
    expect(result.columns).toHaveLength(1);
  });

  it("wraps into multiple columns once a column exceeds the available height", () => {
    // 10 single-row chars at fontSize 24 * lineHeight 1 = rowStep 24 -> maxRowsPerColumn
    // for boxHeight 100 is floor(100/24)=4, so 10 chars need 3 columns (4+4+2).
    const result = fitVerticalText("あいうえおかきくけこ", 1, 10000, 100, 24);
    expect(result.columns.length).toBeGreaterThan(1);
    const totalChars = result.columns.reduce((sum, col) => sum + col.length, 0);
    expect(totalChars).toBe(10);
  });

  it("shrinks the font size until the column block fits within boxWidth", () => {
    const longText = "あ".repeat(30);
    const result = fitVerticalText(longText, 1.2, 50, 100, 48);
    expect(result.fontSize).toBeLessThan(48);
    expect(result.fontSize).toBeGreaterThanOrEqual(6); // MIN_FONT_SIZE
  });

  it("reserves extra column pitch when the text contains ruby, vs. plain text at the same size", () => {
    const plain = fitVerticalText("あ", 1.2, 500, 500, 24);
    const withRuby = fitVerticalText("{あ|a}", 1.2, 500, 500, 24);
    expect(withRuby.colPitch).toBeGreaterThan(plain.colPitch);
    expect(withRuby.rowStep).toBe(plain.rowStep);
  });

  it("respects an explicit line break as a forced column break", () => {
    const result = fitVerticalText("あ\nい", 1.2, 10000, 10000, 24);
    expect(result.columns).toHaveLength(2);
  });

  it("keeps a grouped mono-ruby word together across a column break instead of splitting it", () => {
    // rowStep = 24 * 1 = 24, boxHeight 24 -> maxRowsPerColumn = 1, so plain chars would
    // land one per column — but the 2-pair rubyWord token must still land whole in one
    // column since layoutColumnsGreedy never splits a single token.
    const result = fitVerticalText("あ{東|とう}{京|きょう}い", 1, 10000, 24, 24);
    const columnKinds = result.columns.map((col) => col.map((t) => t.kind));
    expect(columnKinds).toContainEqual(["rubyWord"]);
  });

  it("keeps a grouped bōten emphasis word together across a column break instead of splitting it", () => {
    const result = fitVerticalText("あ{最悪*}い", 1, 10000, 24, 24);
    const wordColumn = result.columns.find((col) => col.length === 1 && col[0].kind === "word");
    expect(wordColumn).toBeDefined();
    if (wordColumn && wordColumn[0].kind === "word") {
      expect(wordColumn[0].chars.map((c) => c.text)).toEqual(["最", "悪"]);
    }
  });

  it("reserves extra column pitch for bōten emphasis, same as for ruby", () => {
    const plain = fitVerticalText("あ", 1.2, 500, 500, 24);
    const withBouten = fitVerticalText("{あ*}", 1.2, 500, 500, 24);
    expect(withBouten.colPitch).toBeGreaterThan(plain.colPitch);
    expect(withBouten.rowStep).toBe(plain.rowStep);
  });

  it("kinsoku shori pulls a leading-prohibited character back into the previous column", () => {
    // Force a break right before a small kana "っ" by sizing the box to exactly one
    // row per column, then verify no column *starts* with a leading-prohibited char.
    const result = fitVerticalText("あっいうえ", 1, 10000, 24, 24);
    for (const column of result.columns) {
      if (column.length === 0) continue;
      const first = column[0];
      expect(first.kind === "char" && first.smallKana).not.toBe(true);
    }
  });
});
