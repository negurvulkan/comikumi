import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api, type FontEntry } from "../api/client";
import { registerFonts, invalidateFontsCache, FALLBACK_FONTS } from "./fontLoader";

interface Props {
  value: string;
  onChange: (family: string) => void;
  /** Rendered next to the "Schriftart" label — e.g. a ScopeSwitch, so callers can
   * add per-language override controls without duplicating this label. */
  labelExtra?: ReactNode;
  disabled?: boolean;
}

export function FontPicker({ value, onChange, labelExtra, disabled }: Props) {
  const { t } = useTranslation();
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    const list = await api.listFonts();
    setFonts(list);
    await registerFonts(list);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadFont(file);
      invalidateFontsCache();
      await refresh();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const projectFamilies = [...new Set(fonts.filter((f) => f.scope === "project").map((f) => f.family))];
  const globalFamilies = [...new Set(fonts.filter((f) => f.scope === "global" && !projectFamilies.includes(f.family)).map((f) => f.family))];
  const otherFamilies = [...new Set([...FALLBACK_FONTS, value])].filter(
    (f) => f && !projectFamilies.includes(f) && !globalFamilies.includes(f)
  );

  return (
    <label>
      <span className="field-label-row">
        {t("managers.presets.fontFamilyLabel")}
        {labelExtra}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: value }} disabled={disabled}>
        {otherFamilies.map((family) => (
          <option key={family} value={family} style={{ fontFamily: family }}>
            {family}
          </option>
        ))}
        {projectFamilies.length > 0 && (
          <optgroup label={t("common.scopeProject")}>
            {projectFamilies.map((family) => (
              <option key={family} value={family} style={{ fontFamily: family }}>
                {family}
              </option>
            ))}
          </optgroup>
        )}
        {globalFamilies.length > 0 && (
          <optgroup label={t("common.scopeShared")}>
            {globalFamilies.map((family) => (
              <option key={family} value={family} style={{ fontFamily: family }}>
                {family}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <input ref={fileInput} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleUpload} disabled={uploading} />
    </label>
  );
}
