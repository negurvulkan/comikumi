import { useTranslation } from "react-i18next";
import type { Panel } from "../../../shared/src/layoutSchema";
import { panelDisplayLabel } from "../../../shared/src/layoutSchema";

interface Props {
  panel: Panel;
  index: number;
  onChange: (patch: Partial<Panel>) => void;
  onDelete: () => void;
}

/** Minimal inspector for a Panel reference region — just a label and outline color,
 * the polygon shape itself is edited by dragging on the canvas (PanelShape.tsx). */
export function PanelInspector({ panel, index, onChange, onDelete }: Props) {
  const { t } = useTranslation();
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

      <p className="hint" style={{ margin: 0 }}>
        {t("editor.panelInspector.dragHint")}
      </p>

      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        {t("editor.panelInspector.deletePanel")}
      </button>
    </div>
  );
}
