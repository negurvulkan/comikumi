import { forwardRef, useMemo, useRef } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { GlossaryEntry } from "../../../shared/src/glossary";

interface Props {
  value: string;
  onChange: (value: string) => void;
  glossary: GlossaryEntry[];
  activeLanguage: string;
  /** Passed straight through to both the textarea and its highlight backdrop, so they
   * stay pixel-aligned (fontFamily/direction/writingMode overrides from the caller). */
  style?: CSSProperties;
  /** Vertical (Japanese) text has no whitespace word boundaries and scrolls on a
   * different axis — highlighting it is a meaningfully harder problem than the
   * horizontal case, so it's out of scope for v1: just render a plain textarea. */
  vertical?: boolean;
  /** Forwarded straight to the underlying textarea — used by BubbleInspector.tsx's
   * keyboard-workflow mode (Tab/Shift+Tab to jump to the next/previous bubble in
   * reading order without leaving the keyboard). */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits `text` into plain-string / matched-term fragments for every glossary entry
 * whose translation in `activeLanguage` appears (case-insensitively) in the text — i.e.
 * highlights approved target-language terms as the translator types them, not the source
 * term. Overlapping matches are resolved by earliest-start-then-longest-first. */
export function buildMatchRanges(text: string, glossary: GlossaryEntry[], activeLanguage: string): { start: number; end: number }[] {
  const terms = glossary.map((e) => e.translations[activeLanguage]?.trim()).filter((t): t is string => !!t);
  if (terms.length === 0) return [];
  const pattern = new RegExp(terms.map(escapeRegExp).join("|"), "gi");
  const raw: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m[0].length === 0) {
      pattern.lastIndex++;
      continue;
    }
    raw.push({ start: m.index, end: m.index + m[0].length });
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) continue; // overlaps a longer/earlier match — skip
    merged.push(r);
  }
  return merged;
}

/** Looks up the stored furigana reading (GlossaryEntry.readings) for a glossary entry
 *  whose `activeLanguage` translation exactly matches `selected` (case-insensitive, exact
 *  match — not a substring search like buildMatchRanges above, since this drives the
 *  "Furigana" toolbar button's pre-fill for a specific user-made selection, not live
 *  highlighting). Returns undefined if there's no matching entry or it has no reading for
 *  this language. Used by BubbleInspector.tsx. */
export function findGlossaryReading(selected: string, glossary: GlossaryEntry[], activeLanguage: string): string | undefined {
  const target = selected.trim().toLowerCase();
  if (!target) return undefined;
  for (const entry of glossary) {
    const translation = entry.translations[activeLanguage]?.trim();
    if (translation && translation.toLowerCase() === target) {
      const reading = entry.readings[activeLanguage]?.trim();
      if (reading) return reading;
    }
  }
  return undefined;
}

/** A `<textarea>` with glossary-term matches highlighted behind it — implemented as a
 * transparent-background textarea stacked over a non-interactive backdrop `<div>`
 * rendering the same text with `<mark>`-wrapped matches, rather than contentEditable
 * (which would need manual caret-position bookkeeping across re-renders; a plain
 * textarea keeps native cursor/selection/IME/undo behavior for free). The textarea is
 * the wrapper's only in-flow child, so the backdrop's `inset: 0` automatically tracks a
 * user resize (`resize: vertical`) with no ResizeObserver needed. */
export const GlossaryHighlightedTextarea = forwardRef<HTMLTextAreaElement, Props>(function GlossaryHighlightedTextarea(
  { value, onChange, glossary, activeLanguage, style, vertical, onKeyDown },
  ref
) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const ranges = useMemo(
    () => (vertical ? [] : buildMatchRanges(value, glossary, activeLanguage)),
    [value, glossary, activeLanguage, vertical]
  );

  if (vertical || ranges.length === 0) {
    // No highlight possible/needed — plain textarea, byte-for-byte the old behavior.
    return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} style={style} onKeyDown={onKeyDown} />;
  }

  const fragments: { text: string; marked: boolean }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) fragments.push({ text: value.slice(cursor, r.start), marked: false });
    fragments.push({ text: value.slice(r.start, r.end), marked: true });
    cursor = r.end;
  }
  if (cursor < value.length) fragments.push({ text: value.slice(cursor), marked: false });

  const sharedTextStyle: CSSProperties = {
    fontFamily: style?.fontFamily,
    fontSize: "inherit",
    lineHeight: 1.4,
    tabSize: 4,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    boxSizing: "border-box",
    padding: "6px 8px",
    // Same border on both layers (not transparent): they occupy the exact same box, so
    // the borders overlap pixel-for-pixel — this just keeps the backdrop's box-sizing
    // math (and therefore its line-wrap width) identical to the textarea's.
    border: "1px solid var(--border)",
    borderRadius: 4,
    margin: 0,
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={backdropRef}
        aria-hidden
        style={{
          ...sharedTextStyle,
          position: "absolute",
          inset: 0,
          overflowY: "scroll",
          overflowX: "hidden",
          pointerEvents: "none",
          color: "transparent",
        }}
      >
        {fragments.map((f, i) =>
          f.marked ? (
            <mark key={i} style={{ background: "rgba(108,140,255,0.35)", color: "transparent", borderRadius: 2 }}>
              {f.text}
            </mark>
          ) : (
            <span key={i}>{f.text}</span>
          )
        )}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (backdropRef.current) {
            backdropRef.current.scrollTop = e.currentTarget.scrollTop;
            backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        style={{ ...style, ...sharedTextStyle, position: "relative", background: "transparent", width: "100%" }}
      />
    </div>
  );
});
