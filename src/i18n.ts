import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translations
import translationEN from "./locales/en/translation.json";
import translationPT from "./locales/pt/translation.json";
// The config editor keeps its strings in their own file: it is a large,
// self-contained feature, and splitting it keeps the shared translation.json
// from growing another few hundred lines. Merged into the same `translation`
// namespace so call sites use plain t("configEditor.…") keys.
import configEditorEN from "./locales/en/configEditor.json";
import configEditorPT from "./locales/pt/configEditor.json";

/** Deep-merges translation bundles; later sources win on leaf collisions. */
function mergeTranslations(
  ...sources: Array<Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      const existing = out[key];
      const bothObjects =
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        typeof existing === "object" &&
        existing !== null &&
        !Array.isArray(existing);
      out[key] = bothObjects
        ? mergeTranslations(
            existing as Record<string, unknown>,
            value as Record<string, unknown>
          )
        : value;
    }
  }
  return out;
}

const resources = {
  en: {
    translation: mergeTranslations(translationEN, configEditorEN),
  },
  pt: {
    translation: mergeTranslations(translationPT, configEditorPT),
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
