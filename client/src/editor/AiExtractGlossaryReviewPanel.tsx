import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LanguageDef } from "../../../shared/src/languages";
import type { ExtractGlossaryAction } from "./aiActions/extractGlossaryAction";

interface Props {
  action: ExtractGlossaryAction;
  languages: LanguageDef[];
  onApply: (nextGlossary: GlossaryEntry[]) => void;
  onDismiss: () => void;
}

/** Review-before-apply for the AI's proposed new glossary entries — checkbox +
 * editable term/per-language-translation fields (same fields GlossaryManager.tsx's own
 * add form uses, just inline here). Unlike bubble-patch actions, applying this means N
 * sequential api.addGlossaryEntry() calls (one per accepted term) rather than a single
 * local store mutation — the glossary is a projectwide, server-persisted list (see
 * GlossaryManager.tsx), not part of the page layout. Each call returns the FULL updated
 * list, so only the last response needs to reach the caller's state. */
export function AiExtractGlossaryReviewPanel({ action, languages, onApply, onDismiss }: Props) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set(action.terms.map((_, i) => i)));
  const [terms, setTerms] = useState<string[]>(() => action.terms.map((entry) => entry.term));
  const [translations, setTranslations] = useState<Record<string, string>[]>(() => action.terms.map((entry) => ({ ...entry.translations })));
  const [busy, setBusy] = useState(false);

  function toggle(i: number) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleApply() {
    setBusy(true);
    try {
      let latest: GlossaryEntry[] = [];
      for (let i = 0; i < action.terms.length; i++) {
        if (!accepted.has(i)) continue;
        latest = await api.addGlossaryEntry({ term: terms[i].trim(), translations: translations[i] });
      }
      if (latest.length > 0) onApply(latest);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector" style={{ maxWidth: 480 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("editor.aiPanel.actions.extractGlossary.reviewTitle", { count: action.terms.length })}</p>
      <p className="hint" style={{ margin: 0 }}>{t("editor.aiPanel.actions.extractGlossary.reviewHint")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        {action.terms.map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <input type="checkbox" checked={accepted.has(i)} onChange={() => toggle(i)} style={{ marginTop: 6 }} />
            <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 4 }}>
              <input
                value={terms[i]}
                onChange={(e) => setTerms((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                disabled={!accepted.has(i)}
                style={{ fontWeight: 600 }}
              />
              {languages.map((l) => (
                <label key={l.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ width: 32, flexShrink: 0 }}>{l.code.toUpperCase()}</span>
                  <input
                    value={translations[i][l.code] ?? ""}
                    onChange={(e) => setTranslations((prev) => prev.map((tr, j) => (j === i ? { ...tr, [l.code]: e.target.value } : tr)))}
                    disabled={!accepted.has(i)}
                    style={{ flex: "1 1 auto" }}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="primary" onClick={handleApply} disabled={accepted.size === 0 || busy}>
          {t("editor.aiPanel.actions.common.applyCount", { count: accepted.size })}
        </button>
        <button type="button" onClick={onDismiss} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
