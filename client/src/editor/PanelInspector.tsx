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
  return (
    <div className="inspector">
      <p style={{ margin: 0, fontWeight: 600 }}>{panelDisplayLabel(panel, index)}</p>

      <label>
        Bezeichnung
        <input
          value={panel.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={`Panel ${index + 1}`}
        />
      </label>

      <label>
        Farbe
        <input type="color" value={panel.color} onChange={(e) => onChange({ color: e.target.value })} />
      </label>

      <p className="hint" style={{ margin: 0 }}>
        Fläche ziehen zum Verschieben, einzelne Punkte zum Verformen. Doppelklick auf den
        Rand fügt einen Punkt hinzu, Rechtsklick auf einen Punkt entfernt ihn (mind. 3
        Punkte bleiben). Nur eine Editor-Markierung — erscheint nicht im PNG-Export.
      </p>

      <button onClick={onDelete} style={{ color: "#ff8a95" }}>
        Panel löschen
      </button>
    </div>
  );
}
