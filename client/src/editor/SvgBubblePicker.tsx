import { useEffect, useRef, useState } from "react";
import { api, type BubbleSvgEntry } from "../api/client";

interface Props {
  onPick: (fileName: string) => void;
}

/** Popover: pick an already-uploaded SVG bubble contour, or upload a new one — same UI pattern as ImagePicker.tsx. */
export function SvgBubblePicker({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [svgs, setSvgs] = useState<BubbleSvgEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setSvgs(await api.listBubbleSvgs());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await api.uploadBubbleSvg(file);
      await refresh();
      onPick(result.fileName);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handlePick(svg: BubbleSvgEntry) {
    onPick(svg.fileName);
    setOpen(false);
  }

  return (
    <div className="language-manager">
      <button onClick={() => setOpen((o) => !o)} className={open ? "active" : ""} title="SVG-Kontur wählen">
        SVG wählen…
      </button>
      {open && (
        <div className="language-manager-panel image-picker-panel">
          {(["project", "global"] as const).map((scope) => {
            const scoped = svgs.filter((svg) => svg.scope === scope);
            if (scoped.length === 0) return null;
            return (
              <div key={scope}>
                <p className="report-heading" style={{ margin: "4px 0" }}>
                  {scope === "project" ? "Projekt" : "Gemeinsam"}
                </p>
                <div className="image-picker-grid">
                  {scoped.map((svg) => (
                    <button key={svg.fileName} className="image-picker-thumb" onClick={() => handlePick(svg)} title={svg.fileName}>
                      <img src={svg.url} alt={svg.fileName} loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {svgs.length === 0 && <p className="hint">Noch keine SVG-Konturen hochgeladen.</p>}
          <label className="image-picker-upload">
            {uploading ? "Lädt hoch…" : "Neue SVG-Kontur hochladen"}
            <input
              ref={fileInput}
              type="file"
              accept="image/svg+xml,.svg"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
          {error && <div className="language-manager-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
