import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import zh from "./locales/zh.json";
import ko from "./locales/ko.json";

// UI-Sprache (Oberfläche) — komplett unabhängig vom Content-Sprachensystem des
// Projekts (Charakter-/Blasentext pro Sprache, siehe shared/src/languages.ts). Diese
// Instanz übersetzt nur Labels/Buttons/Menüs/Fehlermeldungen der App selbst.
export const SUPPORTED_UI_LOCALES = ["en", "de", "ja", "fr", "es", "zh", "ko"] as const;
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
      ja: { translation: ja },
      fr: { translation: fr },
      es: { translation: es },
      zh: { translation: zh },
      ko: { translation: ko },
    },
    supportedLngs: SUPPORTED_UI_LOCALES,
    fallbackLng: "en",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "comikumi.uiLocale",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
