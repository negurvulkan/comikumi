# Japanese (vertical) typesetting

*[Deutsche Version](Japanese-Typesetting.de.md)*

For bubbles with `direction: "vertical-rl"` (columns right-to-left, the default
for Japanese manga lettering) the tool automatically applies several
typographic refinements. This doesn't change the JSON format itself
(see [JSON-Format.md](JSON-Format.md)) — everything is read out of the
normal `text` field at render time.

## Automatic (no action needed)

- **Manual line breaks.** A `\n` in the text now forces an actual
  column break, instead of (as before) being silently removed.
- **Kinsoku shori (禁則処理).** A column never starts with punctuation/small
  kana (、。ー」ゃゅょっ...) and never ends with an opening bracket (「『（...)
  — such characters automatically move to the neighboring column.
- **ー/〜 rotation.** The long vowel mark (ー) and the wave dash (〜) are
  rotated 90° so they appear as a vertical stroke rather than a horizontal
  stroke within the column.
- **Punctuation (、。「」『』（）).** Replaced by their own Unicode "Vertical
  Forms" code points (e.g. 、→ ︑, 。→ ︒) — real glyphs correctly
  positioned/rotated in the upper right by the font itself, not a manual
  trick. The tool checks this once per font via a pixel probe (renders
  the replacement character and compares its ink bounding box with the
  original character); if a font lacks these glyphs, the tool
  automatically falls back to a manual offset toward the upper right.
- **Small kana.** っゃゅょ (and their katakana counterparts) as well as ぁぃぅぇぉ are
  offset slightly toward the upper right within their cell — an
  approximation of the dedicated vertical glyph variants (which this tool
  cannot use directly for lack of native `writing-mode` text layout,
  since every character is drawn individually on canvas; unlike 、。「」,
  no dedicated vertical-forms code points exist for them).
- **Tate-chū-yoko (縦中横).** Short runs of exactly 2 half-width digits/
  letters (e.g. "21", "MP") are set upright and side by side in a
  single cell instead of stacked individually. Runs of odd length
  keep the last character as a normal single character.
- **Word cohesion (katakana/kanji).** Contiguous katakana runs (names,
  loanwords) and kanji runs (compound terms) are never split in the
  middle at a column break — e.g. "ケイト" stays together in one column
  instead of being split into "ケイ"/"ト" across two columns. Individual
  kanji or hiragana transitions (e.g. in 食べる between 食べ and る) remain
  regular, permitted break points.
- **Uniform alignment.** All columns of a text block share a common
  top starting point, instead of (as before) each vertically centering
  itself based on its own character count — this used to make columns
  of different length (e.g. with several `\n`-separated sentences)
  visibly appear "staggered." In addition, the "alignment" setting
  (left/center/right) now also applies to vertical text: it shifts the
  entire column block horizontally within the box, instead of (as
  before) being ignored.

## Manual: furigana

Reading aids above kanji are marked inline in the text:

```
{漢字|かんじ}
```

`漢字` (the base text) is set normally in the column, `かんじ` (the reading)
appears smaller, next to it on the right, evenly distributed over the
height of the base run. If a bubble contains at least one furigana
marker, the column spacing for the entire text block is reserved a
little more generously so the readings have room (a flat, non-per-column-
optimized gap — simpler and more robust than an exact needs-based
calculation).

Unrecognized/incomplete `{...}` expressions (e.g. a forgotten `|`) are
treated as normal text — there is no crash.

## Deliberate simplifications

- The kinsoku adjustment optimizes readability, not perfect column
  height — a column may as a result become one or two characters
  longer than calculated. This is the usual trade-off in other
  (non-strictly-professional) typesetting tools as well.
- Tate-chū-yoko groups fixed runs of 2; longer numbers (e.g. years)
  are deliberately not grouped, since in real manga lettering they're
  usually set individually too.
- Furigana column spacing is applied flatly to the whole text block,
  not only at the positions with actual furigana.
- Word cohesion detects katakana/kanji runs purely by Unicode script
  membership (no dictionary/morphological analysis) — it prevents
  splitting contiguous script runs, but does not (yet) prefer breaks
  directly after particles (は/が/を/に/で/と). Real bunsetsu detection
  would need a tokenizer like TinySegmenter.
