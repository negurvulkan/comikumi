import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Marked } from "marked";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import { useResizableSidebarWidth } from "./useResizableSidebarWidth";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { LoadingIndicator } from "./LoadingIndicator";
import type { Bubble, Panel } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { Character } from "../../../shared/src/characters";
import type { LetteringPreset } from "../../../shared/src/presets";
import type { PageMetaDocument } from "../../../shared/src/pageMeta";
import type { ReadingDirection } from "./reportUtils";
import { useEditorStore } from "../state/editorStore";
import { extractJsonFence, ACTION_FENCE_PREFIX } from "./aiActions/actionUtils";
import {
  TRANSLATE_MISSING_ACTION,
  buildTranslateActionPrompt,
  findMissingTranslationTargets,
  parseTranslateAction,
  type MissingTranslationTarget,
  type TranslateMissingBubblesAction,
} from "./aiTranslateAction";
import {
  FIX_OVERFLOW_ACTION,
  buildFixOverflowPrompt,
  findOverflowTargets,
  parseFixOverflowAction,
  type OverflowTarget,
  type FixOverflowAction,
} from "./aiActions/fixOverflowAction";
import {
  ASSIGN_CHARACTERS_ACTION,
  buildAssignCharactersPrompt,
  findAssignCharacterTargets,
  parseAssignCharactersAction,
  type AssignCharacterTarget,
  type AssignCharactersAction,
} from "./aiActions/assignCharactersAction";
import { STYLE_SFX_ACTION, buildStyleSfxPrompt, findStyleSfxTargets, parseStyleSfxAction, type StyleSfxTarget, type StyleSfxAction } from "./aiActions/styleSfxAction";
import {
  FIX_READING_ORDER_ACTION,
  buildFixReadingOrderPrompt,
  findReadingOrderTargets,
  parseFixReadingOrderAction,
  readingOrderPatches,
  type ReadingOrderTarget,
  type FixReadingOrderAction,
} from "./aiActions/fixReadingOrderAction";
import { EXTRACT_GLOSSARY_ACTION, buildExtractGlossaryPrompt, parseExtractGlossaryAction, type ExtractGlossaryAction } from "./aiActions/extractGlossaryAction";
import {
  FIX_GLOSSARY_USAGE_ACTION,
  buildFixGlossaryUsagePrompt,
  findGlossaryUsageTargets,
  parseFixGlossaryUsageAction,
  type GlossaryUsageTarget,
  type FixGlossaryUsageAction,
} from "./aiActions/fixGlossaryUsageAction";
import { SUGGEST_CHAPTERS_ACTION, buildSuggestChaptersPrompt, parseSuggestChaptersAction, type SuggestChaptersAction } from "./aiActions/suggestChaptersAction";
import {
  SUGGEST_PAGE_TYPES_ACTION,
  buildSuggestPageTypesPrompt,
  findPageTypeCandidates,
  parseSuggestPageTypesAction,
  type SuggestPageTypesAction,
} from "./aiActions/suggestPageTypesAction";
import {
  SUGGEST_TRANSLATION_NOTE_ACTION,
  buildSuggestTranslationNotePrompt,
  parseSuggestTranslationNoteAction,
  type SuggestTranslationNoteAction,
} from "./aiActions/suggestTranslationNoteAction";
import { AiTranslateReviewPanel } from "./AiTranslateReviewPanel";
import { AiBubblePatchReviewPanel, type BubblePatchRow } from "./AiBubblePatchReviewPanel";
import { AiReadingOrderReviewPanel } from "./AiReadingOrderReviewPanel";
import { AiExtractGlossaryReviewPanel } from "./AiExtractGlossaryReviewPanel";
import { AiTranslationNoteReviewPanel } from "./AiTranslationNoteReviewPanel";
import { AiSuggestChaptersReviewPanel } from "./AiSuggestChaptersReviewPanel";
import { AiSuggestPageTypesReviewPanel } from "./AiSuggestPageTypesReviewPanel";

interface Props {
  /** Always mounted (needed for the slide transition to animate) — same convention as
   * every other `.text-sidebar` panel (see StoryBiblePanel.tsx). */
  open: boolean;
  onClose: () => void;
  /** Short human label for what `contextText` represents (e.g. "aktuelle Blase",
   * "aktuelle Seite") — shown next to the include-context checkbox. Omit both props
   * entirely when the host screen has no natural context to offer. */
  contextLabel?: string;
  contextText?: string;
  /** Async counterpart to `contextText` — for context that isn't already sitting in
   * memory and needs a fetch to build (e.g. PageGrid.tsx's whole-volume per-page text
   * summary, via api.getVolumeReport()). Only invoked when the user has context enabled
   * and actually sends a message (same "lazy, rebuilt on every question" idea as
   * `contextRenderedImage` below), never eagerly on mount/open — a large volume's
   * report is comparatively expensive to fetch. Appended after `contextText` when both
   * are present. A fetch failure is swallowed (best-effort, same as the image context
   * below) so a transient error doesn't block the whole question. */
  contextTextAsync?: () => Promise<string>;
  /** Same-origin URL of the current page's image (e.g. `api.pageImageUrl(...)`) — sent
   * alongside `contextText` so the model can see silent/action panels that carry no
   * bubble text. This is the raw, un-lettered background scan — no bubbles/text baked
   * in. Omitted by hosts with no page image (e.g. the script editor, which has no
   * artwork yet). */
  contextImageUrl?: string;
  /** Lazily renders the current page WITH lettering (bubbles/text/curved text) baked
   * in — the same pipeline the export feature uses (see renderPageToPng.ts) — so the
   * model can judge actual typesetting (overflow, cramped lines, alignment) instead of
   * just the bare background. Only invoked when the user enables "send rendered page"
   * and actually sends a message, since rendering is comparatively expensive (loads
   * fonts/placed images). Omitted wherever `contextImageUrl` is omitted. */
  contextRenderedImage?: () => Promise<Blob>;
  /** Present only on the page editor's mount (ScriptEditor.tsx omits it, so every
   * page-scoped action is automatically inactive there — no bubbles to act on) —
   * enables the assistant's PAGE-scoped agentic actions: translate missing bubbles,
   * fix bubble overflow, assign characters, style SFX bubbles, fix reading order,
   * extract/fix glossary terms, suggest a translation note (see client/src/editor/
   * aiActions/ and aiTranslateAction.ts). Gated behind the same `includeContext`
   * checkbox as `contextText`/`contextImageUrl`, since the page content these actions
   * need is itself the same privacy-toggled context. */
  enableActions?: {
    bubbles: Bubble[];
    languages: LanguageDef[];
    glossary: GlossaryEntry[];
    characters: Character[];
    presets: LetteringPreset[];
    panels: Panel[];
    activeLanguage: string;
    readingDirection: ReadingDirection;
    imageWidth: number;
    imageHeight: number;
    onGlossaryChange: (next: GlossaryEntry[]) => void;
    onCommentPosted: (noteText: string, bubbleId?: string) => Promise<void>;
  };
  /** Present only on the pages-overview mount (PageGrid.tsx) — enables the assistant's
   * VOLUME-scoped agentic actions: suggest a chapter breakdown, suggest page-type tags
   * (see aiActions/suggestChaptersAction.ts/suggestPageTypesAction.ts). Deliberately a
   * separate bundle from `enableActions` rather than folded into it — PageGrid.tsx has
   * no bubble/layout data at all (see PageSummary), so a page-scoped action could never
   * be eligible there anyway. */
  enableVolumeActions?: {
    volumeId: string;
    pageNames: string[];
    pageMeta: PageMetaDocument;
    metaEtag: string | null;
    onPageMetaSaved: (next: PageMetaDocument, nextEtag: string | null) => void;
    onPageMetaConflict: () => void;
  };
}

/** Downscales a blob to at most `maxDim` px on its longest edge and re-encodes it as a
 * JPEG data URI — keeps the base64 payload small (both for the request body and for
 * the provider's own vision-token cost) without needing a dedicated server-side resize
 * endpoint. */
async function downscaleBlobToDataUrl(blob: Blob, maxDim = 1280): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_context_unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Same-origin fetch, so no canvas-tainting concerns. */
async function fetchAndDownscaleToDataUrl(url: string, maxDim = 1280): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image_fetch_failed: ${res.status}`);
  return downscaleBlobToDataUrl(await res.blob(), maxDim);
}

type ProviderId = "openai" | "codex" | "anthropic" | "google" | "openrouter" | "ollama";

/** Every action's own `action` discriminator string mapped to its i18n namespace key
 * (see locales/*.json's `editor.aiPanel.actions.<key>`) — kept in one place so the
 * "applied" confirmation message can be looked up generically instead of re-switching
 * on the action kind a second time. */
const ACTION_I18N_KEY: Record<string, string> = {
  [TRANSLATE_MISSING_ACTION]: "translateMissing",
  [FIX_OVERFLOW_ACTION]: "fixOverflow",
  [ASSIGN_CHARACTERS_ACTION]: "assignCharacters",
  [STYLE_SFX_ACTION]: "styleSfx",
  [FIX_READING_ORDER_ACTION]: "fixReadingOrder",
  [EXTRACT_GLOSSARY_ACTION]: "extractGlossary",
  [FIX_GLOSSARY_USAGE_ACTION]: "fixGlossaryUsage",
  [SUGGEST_CHAPTERS_ACTION]: "suggestChapters",
  [SUGGEST_PAGE_TYPES_ACTION]: "suggestPageTypes",
  [SUGGEST_TRANSLATION_NOTE_ACTION]: "suggestTranslationNote",
};

type AnyAiAction =
  | TranslateMissingBubblesAction
  | FixOverflowAction
  | AssignCharactersAction
  | StyleSfxAction
  | FixReadingOrderAction
  | ExtractGlossaryAction
  | FixGlossaryUsageAction
  | SuggestChaptersAction
  | SuggestPageTypesAction
  | SuggestTranslationNoteAction;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Set once a completed assistant response parses as a valid action envelope (see
   * parseAnyAction() below) — when present, this message renders as the matching
   * review panel instead of markdown text. */
  action?: AnyAiAction;
}

/** Markdown → HTML with raw-HTML passthrough disabled and only http(s) links allowed —
 * assistant replies are model output, not authored HTML, so this is treated as
 * untrusted input rather than trusted markdown (no DOMPurify dependency needed for
 * just these two passthrough vectors). */
const safeMarked = new Marked({
  renderer: {
    html(): string {
      return "";
    },
    link({ href, title, tokens }): string {
      const text = this.parser.parseInline(tokens);
      if (!/^https?:\/\//i.test(href)) return text;
      const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
      return `<a href="${href.replace(/"/g, "&quot;")}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/** Read-only-conversation AI assistant panel — same `.text-sidebar` scaffolding as
 * StoryBiblePanel.tsx, mountable identically from Editor.tsx, ScriptEditor.tsx and
 * PageGrid.tsx. Provider-agnostic: the server normalizes every provider into the same
 * SSE wire format (see server/src/routes/ai.ts), so this component never needs to know
 * which one it's talking to beyond the id the user picked. */
export function AIPanel({ open, onClose, contextLabel, contextText, contextTextAsync, contextImageUrl, contextRenderedImage, enableActions, enableVolumeActions }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resize = useResizableSidebarWidth();

  // Every action's eligibility scan, recomputed only when its own inputs change (not on
  // every render) — cheap (one page's/volume's worth of scanning), but no reason to redo
  // it needlessly. Each is used both to build its prompt fragment in handleSend() and to
  // resolve context for already-generated review panels at render time.
  const missingTargets: MissingTranslationTarget[] = useMemo(
    () => (enableActions ? findMissingTranslationTargets(enableActions.bubbles, enableActions.languages) : []),
    [enableActions]
  );
  const overflowTargets: OverflowTarget[] = useMemo(
    () =>
      enableActions
        ? findOverflowTargets(enableActions.bubbles, enableActions.languages, enableActions.presets, enableActions.imageWidth, enableActions.imageHeight)
        : [],
    [enableActions]
  );
  const assignCharacterTargets: AssignCharacterTarget[] = useMemo(
    () => (enableActions ? findAssignCharacterTargets(enableActions.bubbles, enableActions.characters) : []),
    [enableActions]
  );
  const styleSfxTargets: StyleSfxTarget[] = useMemo(() => (enableActions ? findStyleSfxTargets(enableActions.bubbles) : []), [enableActions]);
  const readingOrderTargets: ReadingOrderTarget[] = useMemo(
    () =>
      enableActions
        ? findReadingOrderTargets(enableActions.bubbles, enableActions.panels, enableActions.activeLanguage, enableActions.readingDirection)
        : [],
    [enableActions]
  );
  const glossaryUsageTargets: GlossaryUsageTarget[] = useMemo(
    () => (enableActions ? findGlossaryUsageTargets(enableActions.bubbles, enableActions.languages, enableActions.glossary) : []),
    [enableActions]
  );
  const pageTypeCandidates = useMemo(
    () => (enableVolumeActions ? findPageTypeCandidates(enableVolumeActions.pageNames, enableVolumeActions.pageMeta) : []),
    [enableVolumeActions]
  );

  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, boolean> | null>(null);
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [includeContext, setIncludeContext] = useState(true);
  const [useRenderedContext, setUseRenderedContext] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api
      .getAIProviderStatus()
      .then((status) => {
        const next: Record<ProviderId, boolean> = {
          openai: status.openai.configured,
          codex: status.codex.configured,
          anthropic: status.anthropic.configured,
          google: status.google.configured,
          openrouter: status.openrouter.configured,
          ollama: status.ollama.configured,
        };
        setProviderStatus(next);
        // First configured provider wins as the default — OpenAI/Codex checked first
        // for existing-user continuity, the four newer providers in registration order.
        setProviderId(
          (current) => current ?? ((Object.keys(next) as ProviderId[]).find((id) => next[id]) ?? null)
        );
      })
      .catch((err) => setError(translateApiError(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const hasAnyProvider = providerStatus ? Object.values(providerStatus).some(Boolean) : false;

  const renderedMessages = useMemo(
    () => messages.map((m) => ({ ...m, html: m.role === "assistant" && !m.action ? safeMarked.parse(m.content) : null })),
    [messages]
  );

  /** Peeks the fenced JSON's `action` field and dispatches to the matching schema's own
   * parser — every parser re-validates bubbleIds/languages/etc. against the current
   * targets itself (see each aiActions/*.ts file), so this is just routing, not a
   * second layer of validation. */
  function parseAnyAction(rawText: string): AnyAiAction | null {
    const peek = extractJsonFence(rawText) as { action?: string } | null;
    if (!peek?.action) return null;
    switch (peek.action) {
      case TRANSLATE_MISSING_ACTION:
        return parseTranslateAction(rawText, missingTargets);
      case FIX_OVERFLOW_ACTION:
        return parseFixOverflowAction(rawText, overflowTargets);
      case ASSIGN_CHARACTERS_ACTION:
        return enableActions ? parseAssignCharactersAction(rawText, assignCharacterTargets, enableActions.characters) : null;
      case STYLE_SFX_ACTION:
        return enableActions ? parseStyleSfxAction(rawText, styleSfxTargets, enableActions.presets) : null;
      case FIX_READING_ORDER_ACTION:
        return parseFixReadingOrderAction(rawText, readingOrderTargets);
      case EXTRACT_GLOSSARY_ACTION:
        return enableActions ? parseExtractGlossaryAction(rawText, enableActions.glossary) : null;
      case FIX_GLOSSARY_USAGE_ACTION:
        return parseFixGlossaryUsageAction(rawText, glossaryUsageTargets);
      case SUGGEST_CHAPTERS_ACTION:
        return enableVolumeActions ? parseSuggestChaptersAction(rawText, enableVolumeActions.pageNames) : null;
      case SUGGEST_PAGE_TYPES_ACTION:
        return enableVolumeActions ? parseSuggestPageTypesAction(rawText, pageTypeCandidates.map((c) => c.page)) : null;
      case SUGGEST_TRANSLATION_NOTE_ACTION:
        return parseSuggestTranslationNoteAction(rawText, enableActions?.bubbles.map((b) => b.id) ?? []);
      default:
        return null;
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || !input.trim() || busy) return;
    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      let contextImage: string | undefined;
      if (includeContext && useRenderedContext && contextRenderedImage) {
        // Best-effort, same fallback rationale as the raw-image branch below — a render
        // failure (e.g. a missing placed-image file) shouldn't block the whole question.
        contextImage = await contextRenderedImage()
          .then((blob) => downscaleBlobToDataUrl(blob))
          .catch(() => undefined);
      } else if (includeContext && contextImageUrl) {
        // Best-effort: a failed fetch/encode (network hiccup, etc.) shouldn't block the
        // whole question — just fall back to sending the text context alone, same as
        // contextText already being optional.
        contextImage = await fetchAndDownscaleToDataUrl(contextImageUrl).catch(() => undefined);
      }
      // Best-effort, same rationale as the image fetches above — a transient failure
      // (e.g. a slow/failed api.getVolumeReport() call) shouldn't block the question,
      // just fall back to answering without the volume summary.
      const asyncContextText = includeContext && contextTextAsync ? await contextTextAsync().catch(() => undefined) : undefined;
      // Appended to contextText (not a separate system message — ChatRequestSchema
      // already accepts "system"-role entries, but AIPanel's own ChatMessage type
      // doesn't need one just for this) — every eligible action contributes its own
      // fragment (empty string when nothing's eligible, so an action with nothing to
      // suggest costs nothing extra), concatenated into one combined instruction block.
      const actionPrompt = [
        enableActions ? buildTranslateActionPrompt(missingTargets, enableActions.languages, enableActions.glossary) : "",
        enableActions ? buildFixOverflowPrompt(overflowTargets, enableActions.languages) : "",
        enableActions ? buildAssignCharactersPrompt(assignCharacterTargets, enableActions.characters) : "",
        enableActions ? buildStyleSfxPrompt(styleSfxTargets, enableActions.presets) : "",
        enableActions ? buildFixReadingOrderPrompt(readingOrderTargets) : "",
        enableActions ? buildExtractGlossaryPrompt(enableActions.bubbles, enableActions.languages, enableActions.glossary) : "",
        enableActions ? buildFixGlossaryUsagePrompt(glossaryUsageTargets, enableActions.languages) : "",
        enableActions ? buildSuggestTranslationNotePrompt(enableActions.bubbles) : "",
        enableVolumeActions ? buildSuggestChaptersPrompt(enableVolumeActions.pageNames, enableVolumeActions.pageMeta) : "",
        enableVolumeActions ? buildSuggestPageTypesPrompt(pageTypeCandidates, enableVolumeActions.pageNames.length) : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const combinedContextText = [contextText, asyncContextText, actionPrompt].filter(Boolean).join("\n\n") || undefined;
      const res = await api.sendAIChat({
        providerId,
        messages: nextMessages,
        contextText: includeContext ? combinedContextText : undefined,
        contextImage,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      // null = not yet enough characters to tell; true/false once decided — see
      // aiActions/actionUtils.ts's ACTION_FENCE_PREFIX doc comment for why this can't be
      // known from the very first delta.
      let isActionResponse: boolean | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice("data:".length).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { delta?: string; error?: string };
            if (parsed.error) {
              setError(parsed.error);
              continue;
            }
            if (parsed.delta) {
              assistantText += parsed.delta;
              if (isActionResponse === null && assistantText.length >= ACTION_FENCE_PREFIX.length) {
                isActionResponse = assistantText.startsWith(ACTION_FENCE_PREFIX);
              }
              // While it's still ambiguous (fewer characters than the fence prefix) OR
              // confirmed NOT an action, show the growing text live as before. Once
              // confirmed an action, switch to a placeholder — never flash raw JSON.
              const displayText = isActionResponse ? t("editor.aiPanel.actions.common.preparing") : assistantText;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: displayText };
                return next;
              });
            }
          } catch {
            // Ignore malformed SSE lines rather than aborting the whole render.
          }
        }
      }
      if (isActionResponse) {
        // Re-validates against the current targets rather than trusting the streamed
        // fence-prefix check alone — a model can still emit invalid JSON or a
        // hallucinated id after a correct-looking opening fence (see parseAnyAction).
        const action = parseAnyAction(assistantText);
        setMessages((prev) => {
          const next = [...prev];
          // Fall back to the raw text if it didn't actually validate — never leave the
          // user stuck on a permanent "preparing a suggestion" placeholder.
          next[next.length - 1] = action ? { role: "assistant", content: "", action } : { role: "assistant", content: assistantText };
          return next;
        });
      }
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  function setAppliedMessage(index: number, action: AnyAiAction, count?: number) {
    setMessages((prev) => {
      const next = [...prev];
      const key = ACTION_I18N_KEY[action.action];
      next[index] = { role: "assistant", content: t(`editor.aiPanel.actions.${key}.applied`, { count: count ?? 1 }) };
      return next;
    });
  }

  function dismissActionMessage(index: number) {
    setMessages((prev) => {
      const next = [...prev];
      next[index] = { role: "assistant", content: t("editor.aiPanel.actions.common.dismissed") };
      return next;
    });
  }

  // Shared apply-side for translate_missing_bubbles/fix_glossary_usage — identical
  // {bubbleId, language, text} patch shape, identical applyBubbleTextPatches() target.
  function applyTextPatches(index: number, action: TranslateMissingBubblesAction | FixGlossaryUsageAction, patches: { bubbleId: string; language: string; text: string }[]) {
    useEditorStore.getState().applyBubbleTextPatches(patches);
    setAppliedMessage(index, action, patches.length);
  }

  // Shared apply-side for fix_bubble_overflow/assign_characters/style_sfx_bubbles —
  // each maps its own patch fields onto Partial<Bubble>, then batches through the
  // generic applyBubblePatches() store mutator as one undo step.
  function applyFieldPatches(index: number, action: FixOverflowAction | AssignCharactersAction | StyleSfxAction, acceptedIds: string[]) {
    if (!enableActions) return;
    const accepted = new Set(acceptedIds);
    let patches: { bubbleId: string; patch: Partial<Bubble> }[] = [];
    if (action.action === FIX_OVERFLOW_ACTION) {
      patches = action.patches
        .filter((p) => accepted.has(`${p.bubbleId}:${p.language}`))
        .map((p) => {
          const bubble = enableActions.bubbles.find((b) => b.id === p.bubbleId);
          return { bubbleId: p.bubbleId, patch: { width: p.width, height: p.height, fontSizeOverride: { ...bubble?.fontSizeOverride, [p.language]: p.fontSize } } };
        });
    } else if (action.action === ASSIGN_CHARACTERS_ACTION) {
      patches = action.patches.filter((p) => accepted.has(p.bubbleId)).map((p) => ({ bubbleId: p.bubbleId, patch: { characterId: p.characterId } }));
    } else {
      patches = action.patches.filter((p) => accepted.has(p.bubbleId)).map((p) => ({ bubbleId: p.bubbleId, patch: { presetId: p.presetId, rotation: p.rotation } }));
    }
    useEditorStore.getState().applyBubblePatches(patches);
    setAppliedMessage(index, action, patches.length);
  }

  function applyReadingOrder(index: number, action: FixReadingOrderAction) {
    if (!enableActions) return;
    const patches = readingOrderPatches(enableActions.bubbles, enableActions.panels, enableActions.activeLanguage, enableActions.readingDirection, action.order).map(
      (p) => ({ bubbleId: p.bubbleId, patch: { readingOrderOverride: p.readingOrderOverride } })
    );
    useEditorStore.getState().applyBubblePatches(patches);
    setAppliedMessage(index, action);
  }

  function applyGlossaryExtract(index: number, action: ExtractGlossaryAction, nextGlossary: GlossaryEntry[]) {
    enableActions?.onGlossaryChange(nextGlossary);
    setAppliedMessage(index, action, action.terms.length);
  }

  async function applyTranslationNote(index: number, action: SuggestTranslationNoteAction, noteText: string) {
    if (!enableActions) return;
    await enableActions.onCommentPosted(noteText, action.bubbleId);
    setAppliedMessage(index, action);
  }

  function applyChapters(index: number, action: SuggestChaptersAction, nextMeta: PageMetaDocument, nextEtag: string | null) {
    enableVolumeActions?.onPageMetaSaved(nextMeta, nextEtag);
    setAppliedMessage(index, action, action.chapters.length);
  }

  function applyPageTypes(index: number, action: SuggestPageTypesAction, nextMeta: PageMetaDocument, nextEtag: string | null) {
    enableVolumeActions?.onPageMetaSaved(nextMeta, nextEtag);
    setAppliedMessage(index, action, action.patches.length);
  }

  function renderActionPanel(action: AnyAiAction, index: number) {
    switch (action.action) {
      case TRANSLATE_MISSING_ACTION:
        return (
          <AiTranslateReviewPanel
            action={action}
            targets={missingTargets}
            onApply={(patches) => applyTextPatches(index, action, patches)}
            onDismiss={() => dismissActionMessage(index)}
          />
        );
      case FIX_GLOSSARY_USAGE_ACTION:
        return (
          <AiTranslateReviewPanel
            action={action}
            targets={glossaryUsageTargets}
            onApply={(patches) => applyTextPatches(index, action, patches)}
            onDismiss={() => dismissActionMessage(index)}
          />
        );
      case FIX_OVERFLOW_ACTION: {
        const rows: BubblePatchRow[] = action.patches.map((p) => {
          const target = overflowTargets.find((t2) => t2.bubbleId === p.bubbleId && t2.language === p.language);
          return {
            id: `${p.bubbleId}:${p.language}`,
            bubbleText: target?.text ?? "",
            summary: `${Math.round(target?.width ?? 0)}×${Math.round(target?.height ?? 0)}px @ ${Math.round(target?.fontSize ?? 0)}px → ${Math.round(p.width)}×${Math.round(p.height)}px @ ${Math.round(p.fontSize)}px`,
            note: p.note,
          };
        });
        return (
          <AiBubblePatchReviewPanel
            titleKey="editor.aiPanel.actions.fixOverflow.reviewTitle"
            hintKey="editor.aiPanel.actions.fixOverflow.reviewHint"
            rows={rows}
            onApply={(ids) => applyFieldPatches(index, action, ids)}
            onDismiss={() => dismissActionMessage(index)}
          />
        );
      }
      case ASSIGN_CHARACTERS_ACTION: {
        const rows: BubblePatchRow[] = action.patches.map((p) => {
          const target = assignCharacterTargets.find((t2) => t2.bubbleId === p.bubbleId);
          const character = enableActions?.characters.find((c) => c.id === p.characterId);
          return { id: p.bubbleId, bubbleText: target?.text ?? "", summary: `→ ${character?.name ?? p.characterId}`, note: p.note };
        });
        return (
          <AiBubblePatchReviewPanel
            titleKey="editor.aiPanel.actions.assignCharacters.reviewTitle"
            hintKey="editor.aiPanel.actions.assignCharacters.reviewHint"
            rows={rows}
            onApply={(ids) => applyFieldPatches(index, action, ids)}
            onDismiss={() => dismissActionMessage(index)}
          />
        );
      }
      case STYLE_SFX_ACTION: {
        const rows: BubblePatchRow[] = action.patches.map((p) => {
          const target = styleSfxTargets.find((t2) => t2.bubbleId === p.bubbleId);
          const preset = enableActions?.presets.find((pr) => pr.id === p.presetId);
          return { id: p.bubbleId, bubbleText: target?.text ?? "", summary: `${preset?.name ?? p.presetId}, ${p.rotation}°`, note: p.note };
        });
        return (
          <AiBubblePatchReviewPanel
            titleKey="editor.aiPanel.actions.styleSfx.reviewTitle"
            hintKey="editor.aiPanel.actions.styleSfx.reviewHint"
            rows={rows}
            onApply={(ids) => applyFieldPatches(index, action, ids)}
            onDismiss={() => dismissActionMessage(index)}
          />
        );
      }
      case FIX_READING_ORDER_ACTION:
        return (
          <AiReadingOrderReviewPanel
            action={action}
            targets={readingOrderTargets}
            onApply={() => applyReadingOrder(index, action)}
            onDismiss={() => dismissActionMessage(index)}
          />
        );
      case EXTRACT_GLOSSARY_ACTION:
        return (
          <AiExtractGlossaryReviewPanel
            action={action}
            languages={enableActions?.languages ?? []}
            onApply={(next) => applyGlossaryExtract(index, action, next)}
            onDismiss={() => dismissActionMessage(index)}
          />
        );
      case SUGGEST_TRANSLATION_NOTE_ACTION:
        return (
          <AiTranslationNoteReviewPanel action={action} onApply={(text) => applyTranslationNote(index, action, text)} onDismiss={() => dismissActionMessage(index)} />
        );
      case SUGGEST_CHAPTERS_ACTION:
        return enableVolumeActions ? (
          <AiSuggestChaptersReviewPanel
            action={action}
            volumeId={enableVolumeActions.volumeId}
            pageNames={enableVolumeActions.pageNames}
            pageMeta={enableVolumeActions.pageMeta}
            metaEtag={enableVolumeActions.metaEtag}
            onSaved={(nextMeta, nextEtag) => applyChapters(index, action, nextMeta, nextEtag)}
            onConflict={() => enableVolumeActions.onPageMetaConflict()}
            onDismiss={() => dismissActionMessage(index)}
          />
        ) : null;
      case SUGGEST_PAGE_TYPES_ACTION:
        return enableVolumeActions ? (
          <AiSuggestPageTypesReviewPanel
            action={action}
            volumeId={enableVolumeActions.volumeId}
            pageMeta={enableVolumeActions.pageMeta}
            metaEtag={enableVolumeActions.metaEtag}
            onSaved={(nextMeta, nextEtag) => applyPageTypes(index, action, nextMeta, nextEtag)}
            onConflict={() => enableVolumeActions.onPageMetaConflict()}
            onDismiss={() => dismissActionMessage(index)}
          />
        ) : null;
      default:
        return null;
    }
  }

  return (
    <div className={`text-sidebar${open ? " open" : ""}`} style={{ width: open ? resize.width : undefined }}>
      <SidebarResizeHandle
        dragging={resize.dragging}
        onPointerDown={resize.handlePointerDown}
        onPointerMove={resize.handlePointerMove}
        onPointerUp={resize.handlePointerUp}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.aiPanel.title")}</p>
        <button onClick={onClose}>{t("common.close")}</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {providerStatus && !hasAnyProvider && (
        <p className="hint">
          {t("editor.aiPanel.noProviderConfigured")}{" "}
          <button type="button" onClick={() => navigate("/account")} style={{ padding: 0 }}>
            {t("editor.aiPanel.configureLink")}
          </button>
        </p>
      )}

      {hasAnyProvider && (
        <>
          <select value={providerId ?? ""} onChange={(e) => setProviderId(e.target.value as ProviderId)}>
            {providerStatus?.openai && <option value="openai">OpenAI</option>}
            {providerStatus?.codex && <option value="codex">Codex</option>}
            {providerStatus?.anthropic && <option value="anthropic">Anthropic (Claude)</option>}
            {providerStatus?.google && <option value="google">Google (Gemini)</option>}
            {providerStatus?.openrouter && <option value="openrouter">OpenRouter</option>}
            {providerStatus?.ollama && <option value="ollama">Ollama</option>}
          </select>

          {(contextText !== undefined || contextTextAsync) && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} />
              {t("editor.aiPanel.includeContext", { label: contextLabel ?? t("editor.aiPanel.defaultContextLabel") })}
            </label>
          )}

          {includeContext && contextRenderedImage && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={useRenderedContext} onChange={(e) => setUseRenderedContext(e.target.checked)} />
              {t("editor.aiPanel.useRenderedContext")}
            </label>
          )}

          <div ref={scrollRef} className="sidebar-scroll-body">
            {renderedMessages.length === 0 && <p className="hint">{t("editor.aiPanel.empty")}</p>}
            {renderedMessages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} style={{ margin: 0, fontWeight: 600, whiteSpace: "pre-wrap" }}>
                  {m.content}
                </p>
              ) : m.action ? (
                <div key={i}>{renderActionPanel(m.action, i)}</div>
              ) : i === renderedMessages.length - 1 && busy && !m.content ? (
                // The assistant message is inserted with empty content the instant
                // Send fires (see handleSend), before the fetch even starts — without
                // this, that gap (page-image rendering + time-to-first-token) shows a
                // literally empty div with nothing to indicate anything is happening.
                <div key={i} style={{ margin: 0 }}>
                  <LoadingIndicator size="sm" />
                </div>
              ) : (
                // eslint-disable-next-line react/no-danger
                <div key={i} style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: m.html ?? "" }} />
              )
            )}
          </div>

          <form onSubmit={handleSend} style={{ display: "flex", gap: 6 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("editor.aiPanel.inputPlaceholder")}
              style={{ minHeight: 44, flex: "1 1 auto" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
            <button type="submit" className="primary" disabled={busy || !input.trim()}>
              {t("editor.aiPanel.send")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
