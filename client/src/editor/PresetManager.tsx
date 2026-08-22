import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { translateApiError } from "../i18n/translateApiError";
import type { LetteringPreset, PresetTextFields, PresetBackgroundFields } from "../../../shared/src/presets";
import type { BubbleVisualStyle, TailChainSegmentShape, TailStyle, TextAlign, TextDirection } from "../../../shared/src/layoutSchema";
import { FontPicker } from "./FontPicker";
import { useConfirmDialog } from "./ConfirmDialog";

interface Props {
  presets: LetteringPreset[];
  onChange: (presets: LetteringPreset[]) => void;
  onClose?: () => void;
}

const DEFAULT_TEXT: Required<PresetTextFields> = {
  fontFamily: "Anime Ace",
  fontSize: 24,
  lineHeight: 1.2,
  align: "center",
  direction: "ltr",
  color: "#000000",
  textOutline: { enabled: false, color: "#000000", widthPx: 4 },
  textGradient: { enabled: false, colorStart: "#ffffff", colorEnd: "#6c8cff", angleDeg: 0 },
};

const DEFAULT_BACKGROUND: Required<PresetBackgroundFields> = {
  bubbleStyle: "none",
  fillColor: "#ffffff",
  strokeColor: "#000000",
  strokeWidthPx: 6,
  svgFileName: null,
  tailStyle: "point",
  tailChainSegmentShape: "circle",
  tailChainSegments: 3,
  tailChainSpacing: 1,
};

function emptyForm() {
  return { name: "", text: {} as PresetTextFields, background: {} as PresetBackgroundFields };
}

/** Row for a simple scalar preset field: a checkbox that toggles whether this preset
 * defines the field at all (sparse — unchecked means "not part of this preset, every
 * linked element keeps its own value"), plus the control itself, shown/enabled only
 * once checked. */
function FieldToggle<T>({
  label,
  value,
  defaultValue,
  onChange,
  children,
}: {
  label: string;
  value: T | undefined;
  defaultValue: T;
  onChange: (value: T | undefined) => void;
  children: (value: T, set: (v: T) => void) => React.ReactNode;
}) {
  const active = value !== undefined;
  return (
    <div className="field-row" style={{ alignItems: "center" }}>
      <label style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
        <input type="checkbox" checked={active} onChange={(e) => onChange(e.target.checked ? defaultValue : undefined)} />
        {label}
      </label>
      {active && children(value, onChange)}
    </div>
  );
}

/** Projectwide, live-linked style presets — editable from the "Projekt"-menu on every
 * screen. Each field is individually toggle-able (sparse): only checked fields are part
 * of the saved preset and live-drive every Bubble/CurvedTextElement linked to it via
 * presetId (see resolveBubbleStyle/resolveBubbleForm/resolveCurvedTextStyle). */
export function PresetManager({ presets, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(p: LetteringPreset) {
    setEditingId(p.id);
    setForm({ name: p.name, text: p.text, background: p.background });
  }

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  function setText<K extends keyof PresetTextFields>(key: K, value: PresetTextFields[K]) {
    setForm((f) => ({ ...f, text: { ...f.text, [key]: value } }));
  }

  function setBackground<K extends keyof PresetBackgroundFields>(key: K, value: PresetBackgroundFields[K]) {
    setForm((f) => ({ ...f, background: { ...f.background, [key]: value } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { name: form.name.trim(), text: form.text, background: form.background };
      const next = editingId ? await api.updatePreset(editingId, payload) : await api.addPreset(payload);
      onChange(next);
      resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ message: t("managers.presets.confirmDelete"), danger: true, confirmLabel: t("common.delete") }))) return;
    setError(null);
    setBusy(true);
    try {
      const next = await api.deletePreset(id);
      onChange(next);
      if (editingId === id) resetForm();
    } catch (err) {
      setError(translateApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  const text = form.text;
  const background = form.background;
  const showTailChain = background.tailStyle === "chain";

  return (
    <div className="inspector" style={{ maxWidth: 460, maxHeight: "80vh", overflowY: "auto" }}>
      {confirmDialog}
      <p style={{ margin: 0, fontWeight: 600 }}>{t("managers.presets.title")}</p>

      <div className="language-manager-list">
        {presets.map((p) => (
          <div key={p.id} className="language-manager-row">
            <button
              type="button"
              onClick={() => startEdit(p)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}
              title={t("common.edit")}
            >
              {p.name}
            </button>
            <button onClick={() => handleDelete(p.id)} disabled={busy} title={t("managers.presets.remove")}>
              ×
            </button>
          </div>
        ))}
        {presets.length === 0 && <p className="hint">{t("managers.presets.empty")}</p>}
      </div>

      <form onSubmit={handleSubmit} className="language-manager-form">
        <label>
          {t("managers.characters.nameLabel")}
          <input
            placeholder={t("managers.presets.namePlaceholder")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>

        <p className="report-heading" style={{ margin: "8px 0 0" }}>
          {t("managers.presets.textStyleHeading")}
        </p>

        <FieldToggle label={t("managers.presets.fontFamilyLabel")} value={text.fontFamily} defaultValue={DEFAULT_TEXT.fontFamily} onChange={(v) => setText("fontFamily", v)}>
          {(v, set) => <FontPicker value={v} onChange={set} />}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.fontSizeLabel")} value={text.fontSize} defaultValue={DEFAULT_TEXT.fontSize} onChange={(v) => setText("fontSize", v)}>
          {(v, set) => <input type="number" min={4} value={v} onChange={(e) => set(Number(e.target.value))} />}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.lineHeightLabel")} value={text.lineHeight} defaultValue={DEFAULT_TEXT.lineHeight} onChange={(v) => setText("lineHeight", v)}>
          {(v, set) => <input type="number" step={0.1} min={0.8} value={v} onChange={(e) => set(Number(e.target.value))} />}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.alignLabel")} value={text.align} defaultValue={DEFAULT_TEXT.align} onChange={(v) => setText("align", v)}>
          {(v, set) => (
            <select value={v} onChange={(e) => set(e.target.value as TextAlign)}>
              <option value="left">{t("managers.presets.alignLeft")}</option>
              <option value="center">{t("managers.presets.alignCenter")}</option>
              <option value="right">{t("managers.presets.alignRight")}</option>
            </select>
          )}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.directionLabel")} value={text.direction} defaultValue={DEFAULT_TEXT.direction} onChange={(v) => setText("direction", v)}>
          {(v, set) => (
            <select value={v} onChange={(e) => set(e.target.value as TextDirection)}>
              <option value="ltr">{t("managers.presets.directionLtr")}</option>
              <option value="rtl">{t("managers.presets.directionRtl")}</option>
              <option value="vertical-rl">{t("managers.presets.directionVertical")}</option>
            </select>
          )}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.colorLabel")} value={text.color} defaultValue={DEFAULT_TEXT.color} onChange={(v) => setText("color", v)}>
          {(v, set) => <input type="color" value={v} onChange={(e) => set(e.target.value)} />}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.textOutlineLabel")} value={text.textOutline} defaultValue={DEFAULT_TEXT.textOutline} onChange={(v) => setText("textOutline", v)}>
          {(v, set) => (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={v.enabled} onChange={(e) => set({ ...v, enabled: e.target.checked })} />
                {t("managers.presets.onLabel")}
              </label>
              <input type="color" value={v.color} onChange={(e) => set({ ...v, color: e.target.value })} />
              <input type="number" min={1} value={v.widthPx} onChange={(e) => set({ ...v, widthPx: Number(e.target.value) })} />
            </div>
          )}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.textGradientLabel")} value={text.textGradient} defaultValue={DEFAULT_TEXT.textGradient} onChange={(v) => setText("textGradient", v)}>
          {(v, set) => (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={v.enabled} onChange={(e) => set({ ...v, enabled: e.target.checked })} />
                {t("managers.presets.onLabel")}
              </label>
              <input type="color" value={v.colorStart} onChange={(e) => set({ ...v, colorStart: e.target.value })} />
              <input type="color" value={v.colorEnd} onChange={(e) => set({ ...v, colorEnd: e.target.value })} />
            </div>
          )}
        </FieldToggle>

        <p className="report-heading" style={{ margin: "8px 0 0" }}>
          {t("managers.presets.backgroundHeading")}
        </p>

        <FieldToggle
          label={t("managers.presets.bubbleStyleLabel")}
          value={background.bubbleStyle}
          defaultValue={DEFAULT_BACKGROUND.bubbleStyle}
          onChange={(v) => setBackground("bubbleStyle", v)}
        >
          {(v, set) => (
            <select value={v} onChange={(e) => set(e.target.value as BubbleVisualStyle)}>
              <option value="none">{t("managers.presets.bubbleStyleNone")}</option>
              <option value="speech">{t("managers.presets.bubbleStyleSpeech")}</option>
              <option value="thought">{t("managers.presets.bubbleStyleThought")}</option>
              <option value="shout">{t("managers.presets.bubbleStyleShout")}</option>
              <option value="svg">{t("managers.presets.bubbleStyleSvg")}</option>
            </select>
          )}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.fillColorLabel")} value={background.fillColor} defaultValue={DEFAULT_BACKGROUND.fillColor} onChange={(v) => setBackground("fillColor", v)}>
          {(v, set) => <input type="color" value={v} onChange={(e) => set(e.target.value)} />}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.strokeColorLabel")} value={background.strokeColor} defaultValue={DEFAULT_BACKGROUND.strokeColor} onChange={(v) => setBackground("strokeColor", v)}>
          {(v, set) => <input type="color" value={v} onChange={(e) => set(e.target.value)} />}
        </FieldToggle>

        <FieldToggle
          label={t("managers.presets.strokeWidthLabel")}
          value={background.strokeWidthPx}
          defaultValue={DEFAULT_BACKGROUND.strokeWidthPx}
          onChange={(v) => setBackground("strokeWidthPx", v)}
        >
          {(v, set) => <input type="number" min={0} value={v} onChange={(e) => set(Number(e.target.value))} />}
        </FieldToggle>

        <FieldToggle label={t("managers.presets.tailStyleLabel")} value={background.tailStyle} defaultValue={DEFAULT_BACKGROUND.tailStyle} onChange={(v) => setBackground("tailStyle", v)}>
          {(v, set) => (
            <select value={v} onChange={(e) => set(e.target.value as TailStyle)}>
              <option value="point">{t("managers.presets.tailStylePoint")}</option>
              <option value="point-detached">{t("managers.presets.tailStylePointDetached")}</option>
              <option value="chain">{t("managers.presets.tailStyleChain")}</option>
            </select>
          )}
        </FieldToggle>

        {showTailChain && (
          <>
            <FieldToggle
              label={t("managers.presets.segmentShapeLabel")}
              value={background.tailChainSegmentShape}
              defaultValue={DEFAULT_BACKGROUND.tailChainSegmentShape}
              onChange={(v) => setBackground("tailChainSegmentShape", v)}
            >
              {(v, set) => (
                <select value={v} onChange={(e) => set(e.target.value as TailChainSegmentShape)}>
                  <option value="circle">{t("managers.presets.segmentShapeCircle")}</option>
                  <option value="rect">{t("managers.presets.segmentShapeRect")}</option>
                  <option value="diamond">{t("managers.presets.segmentShapeDiamond")}</option>
                </select>
              )}
            </FieldToggle>
            <FieldToggle
              label={t("managers.presets.segmentsCountLabel")}
              value={background.tailChainSegments}
              defaultValue={DEFAULT_BACKGROUND.tailChainSegments}
              onChange={(v) => setBackground("tailChainSegments", v)}
            >
              {(v, set) => <input type="number" min={1} max={8} value={v} onChange={(e) => set(Number(e.target.value))} />}
            </FieldToggle>
            <FieldToggle
              label={t("managers.presets.segmentSpacingLabel")}
              value={background.tailChainSpacing}
              defaultValue={DEFAULT_BACKGROUND.tailChainSpacing}
              onChange={(v) => setBackground("tailChainSpacing", v)}
            >
              {(v, set) => <input type="number" step={0.1} min={0.1} value={v} onChange={(e) => set(Number(e.target.value))} />}
            </FieldToggle>
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "…" : editingId ? t("common.save") : t("common.add")}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} disabled={busy}>
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
      {error && <div className="language-manager-error">{error}</div>}

      {onClose && (
        <button type="button" onClick={onClose}>
          {t("common.close")}
        </button>
      )}
    </div>
  );
}
