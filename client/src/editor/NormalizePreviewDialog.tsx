import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { FlaggedPage } from "../export/useNormalizeRun";
import { resizeToUniformFormat, type UniformFitMode } from "../export/uniformFormat";

const PREVIEW_HEIGHT = 130;

interface Props {
  volumeId: string;
  flaggedPages: FlaggedPage[];
  targetWidth: number;
  targetHeight: number;
  onConfirm: (resolutions: Map<string, UniformFitMode | "skip">) => void;
  onCancel: () => void;
}

const FIT_MODES: UniformFitMode[] = ["pad", "crop", "stretch"];

function PagePreviewTile({
  volumeId,
  page,
  targetWidth,
  targetHeight,
  fitMode,
  active,
  onSelect,
}: {
  volumeId: string;
  page: FlaggedPage;
  targetWidth: number;
  targetHeight: number;
  fitMode: UniformFitMode;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const img = new Image();
    img.crossOrigin = "use-credentials";
    img.onload = () => {
      if (cancelled) return;
      const canvas = resizeToUniformFormat(img, page.width, page.height, targetWidth, targetHeight, fitMode);
      canvas.toBlob((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      });
    };
    img.src = api.pageImageUrl(volumeId, page.page);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId, page.page, targetWidth, targetHeight, fitMode]);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: 6,
        border: active ? "2px solid var(--accent, #4a9eff)" : "1px solid var(--border)",
        borderRadius: 6,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <div style={{ width: 90, height: PREVIEW_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden" }}>
        {previewUrl ? (
          <img src={previewUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />
        ) : (
          <span className="hint" style={{ fontSize: 10 }}>…</span>
        )}
      </div>
      <span style={{ fontSize: 11 }}>{t(`normalizePreview.fitMode.${fitMode}`)}</span>
    </button>
  );
}

/**
 * Shown between clicking "Export" (with format === "uniform") and the actual render
 * loop, only when useNormalizeRun's analyze() found at least one page whose aspect
 * ratio deviates from the target beyond DISTORTION_WARNING_THRESHOLD. Lets the user
 * see a preview of all three fit modes per flagged page and pick one (or skip the
 * page) before anything is rendered/uploaded — see uniformFormat.ts for the fit math.
 */
export function NormalizePreviewDialog({ volumeId, flaggedPages, targetWidth, targetHeight, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [choices, setChoices] = useState<Map<string, UniformFitMode | "skip">>(
    () => new Map(flaggedPages.map((p) => [p.page, "pad" as UniformFitMode | "skip"]))
  );

  function setChoice(page: string, choice: UniformFitMode | "skip") {
    setChoices((prev) => {
      const next = new Map(prev);
      next.set(page, choice);
      return next;
    });
  }

  return (
    <div className="inspector" style={{ maxWidth: 560, maxHeight: "80vh", overflowY: "auto" }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("normalizePreview.title")}</p>
      <p style={{ color: "var(--text-muted)", margin: "-4px 0 0", fontSize: 12 }}>
        {t("normalizePreview.intro", { count: flaggedPages.length })}
      </p>

      {flaggedPages.map((page) => {
        const choice = choices.get(page.page) ?? "pad";
        return (
          <div key={page.page} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 600 }}>{page.page}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {t("normalizePreview.distortion", { value: Math.round(page.distortion * 100) })}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FIT_MODES.map((fitMode) => (
                <PagePreviewTile
                  key={fitMode}
                  volumeId={volumeId}
                  page={page}
                  targetWidth={targetWidth}
                  targetHeight={targetHeight}
                  fitMode={fitMode}
                  active={choice === fitMode}
                  onSelect={() => setChoice(page.page, fitMode)}
                />
              ))}
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={choice === "skip"} onChange={(e) => setChoice(page.page, e.target.checked ? "skip" : "pad")} />
              {t("normalizePreview.skipPage")}
            </label>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="primary" onClick={() => onConfirm(choices)}>
          {t("normalizePreview.confirm")}
        </button>
        <button onClick={onCancel}>{t("common.close")}</button>
      </div>
    </div>
  );
}
