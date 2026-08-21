import { useTranslation } from "react-i18next";
import { SUPPORTED_UI_LOCALES, type UiLocale } from "../i18n";

// Each language's own name for itself — a proper noun in its own script, identical
// no matter which UI locale is currently active, so this lives here rather than in
// the translation files (translating "Deutsch" into Japanese would be wrong: the
// entry must stay legible to someone who doesn't yet read the target language).
const NATIVE_NAMES: Record<UiLocale, string> = {
  en: "English",
  de: "Deutsch",
  ja: "日本語",
  fr: "Français",
  es: "Español",
  zh: "中文",
  ko: "한국어",
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = SUPPORTED_UI_LOCALES.includes(i18n.language as UiLocale) ? (i18n.language as UiLocale) : "en";

  return (
    <select
      value={current}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      aria-label="UI language"
      style={{ fontSize: 12 }}
    >
      {SUPPORTED_UI_LOCALES.map((code) => (
        <option key={code} value={code}>
          {NATIVE_NAMES[code]}
        </option>
      ))}
    </select>
  );
}
