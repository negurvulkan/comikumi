import { useTranslation } from "react-i18next";
import type { Panel, PanelCut, Point } from "../../../shared/src/layoutSchema";
import { cutPanelReplacementFileForLanguage, panelDisplayLabel, resolvePanelForLanguage } from "../../../shared/src/layoutSchema";
import { ImagePicker } from "./ImagePicker";
import { api } from "../api/client";

interface Props {
  panel: Panel;
  index: number;
  activeLanguage: string;
  onChange: (patch: Partial<Panel>) => void;
  onDelete: () => void;
}

type CutContentMode = "original" | "removed" | "replacement";

function cutContentMode(cut: PanelCut | undefined): CutContentMode {
  if (cut?.removed) return "removed";
  if (cut?.replacement) return "replacement";
  return "original";
}

/** Minimal inspector for a Panel reference region — just a label and outline color,
 * the polygon shape itself is edited by dragging on the canvas (PanelShape.tsx). */
export function PanelInspector({ panel, index, activeLanguage, onChange, onDelete }: Props) {
  const { t } = useTranslation();
  // Resolved for the active language — the same panel can be a plain untouched marker in
  // one language (no override, or an override with no active removed/replacement) and a
  // moved/removed/replaced Cut-Panel in another. See Panel.languageOverride's doc comment.
  const resolved = resolvePanelForLanguage(panel, activeLanguage);
  const hasLanguageOverride = !!panel.languageOverride?.[activeLanguage];

  // Same "opt in per language" pattern as PanelShape.tsx's commitPanel/BubbleShape.tsx's
  // commitForm — writes into the active language's override once one exists, otherwise
  // straight into the base fields.
  function commitPanel(patch: Partial<{ points: Point[]; origin: Point; cut: PanelCut | undefined }>) {
    if (hasLanguageOverride) {
      onChange({ languageOverride: { ...panel.languageOverride, [activeLanguage]: { ...resolved, ...patch } } });
    } else {
      onChange(patch);
    }
  }

  const replacementFile = cutPanelReplacementFileForLanguage(resolved.cut, activeLanguage);

  return (
    <div className="inspector">
      <p style={{ margin: 0, fontWeight: 600 }}>{panelDisplayLabel(panel, index)}</p>

      <label>
        {t("editor.panelInspector.labelLabel")}
        <input
          value={panel.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={t("editor.panelInspector.labelPlaceholder", { index: index + 1 })}
        />
      </label>

      <label>
        {t("managers.presets.colorLabel")}
        <input type="color" value={panel.color} onChange={(e) => onChange({ color: e.target.value })} />
      </label>

      {panel.cut && (
        <>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={hasLanguageOverride}
              onChange={(e) => {
                if (e.target.checked) {
                  // Seed from the currently resolved state — no visual jump on toggle.
                  onChange({ languageOverride: { ...panel.languageOverride, [activeLanguage]: { ...resolved } } });
                } else {
                  const next = { ...panel.languageOverride };
                  delete next[activeLanguage];
                  onChange({ languageOverride: next });
                }
              }}
            />
            {t("editor.panelInspector.languageOverrideLabel", { language: activeLanguage })}
          </label>
          <p className="hint" style={{ margin: 0 }}>
            {t("editor.panelInspector.languageOverrideHint")}
          </p>

          <label>
            {t("editor.panelInspector.holeFillModeLabel")}
            <select
              value={resolved.cut!.holeFill.mode}
              onChange={(e) => commitPanel({ cut: { ...resolved.cut!, holeFill: { ...resolved.cut!.holeFill, mode: e.target.value as "auto" | "manual" } } })}
            >
              <option value="auto">{t("editor.panelInspector.holeFillModeAuto")}</option>
              <option value="manual">{t("editor.panelInspector.holeFillModeManual")}</option>
            </select>
          </label>
          <label>
            {t("editor.panelInspector.holeFillColorLabel")}
            <input
              type="color"
              value={resolved.cut!.holeFill.color}
              disabled={resolved.cut!.holeFill.mode !== "manual"}
              onChange={(e) => commitPanel({ cut: { ...resolved.cut!, holeFill: { ...resolved.cut!.holeFill, color: e.target.value } } })}
            />
          </label>
          <label>
            {t("editor.panelInspector.contentModeLabel")}
            <select
              value={cutContentMode(resolved.cut)}
              onChange={(e) => {
                const next = e.target.value as CutContentMode;
                commitPanel({
                  cut: {
                    ...resolved.cut!,
                    removed: next === "removed" ? true : undefined,
                    replacement: next === "replacement" ? (resolved.cut!.replacement ?? { files: {} }) : undefined,
                  },
                });
              }}
            >
              <option value="original">{t("editor.panelInspector.contentModeOriginal")}</option>
              <option value="removed">{t("editor.panelInspector.contentModeRemoved")}</option>
              <option value="replacement">{t("editor.panelInspector.contentModeReplacement")}</option>
            </select>
          </label>

          {cutContentMode(resolved.cut) === "removed" && (
            <p className="hint" style={{ margin: 0 }}>
              {t("editor.panelInspector.removedHint")}
            </p>
          )}

          {cutContentMode(resolved.cut) === "replacement" && (
            <>
              <div className="field-row" style={{ alignItems: "center", gap: 8 }}>
                <ImagePicker
                  onInsert={(fileName) =>
                    commitPanel({
                      cut: {
                        ...resolved.cut!,
                        replacement: { ...resolved.cut!.replacement!, files: { ...resolved.cut!.replacement!.files, [activeLanguage]: fileName } },
                      },
                    })
                  }
                />
                {replacementFile && (
                  <img src={api.imagesFileUrl(replacementFile)} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />
                )}
              </div>
              <label>
                {t("editor.panelInspector.borderColorLabel")}
                <input
                  type="color"
                  value={resolved.cut!.replacement?.border?.color ?? "#000000"}
                  onChange={(e) =>
                    commitPanel({
                      cut: {
                        ...resolved.cut!,
                        replacement: {
                          ...resolved.cut!.replacement!,
                          border: { widthPx: resolved.cut!.replacement?.border?.widthPx ?? 4, color: e.target.value },
                        },
                      },
                    })
                  }
                />
              </label>
              <label>
                {t("editor.panelInspector.borderWidthLabel")}
                <input
                  type="number"
                  min={0}
                  value={resolved.cut!.replacement?.border?.widthPx ?? 0}
                  onChange={(e) => {
                    const widthPx = Number(e.target.value);
                    commitPanel({
                      cut: {
                        ...resolved.cut!,
                        replacement: {
                          ...resolved.cut!.replacement!,
                          border: widthPx > 0 ? { color: resolved.cut!.replacement?.border?.color ?? "#000000", widthPx } : undefined,
                        },
                      },
                    });
                  }}
                />
              </label>
            </>
          )}

          <p className="hint" style={{ margin: 0 }}>
            {t("editor.panelInspector.cutPanelHint")}
          </p>
        </>
      )}

      <p className="hint" style={{ margin: 0 }}>
        {t("editor.panelInspector.dragHint")}
      </p>

      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.panelInspector.deletePanel")}
      </button>
    </div>
  );
}
