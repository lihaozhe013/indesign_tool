import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';
import { isSupportedLocale, type Locale } from './locale.js';

const resources = {
  en: { translation: en },
  'zh-Hans': { translation: zhHans }
} as const;

let instance: I18nInstance | null = null;

export function setupI18n(locale: Locale): I18nInstance {
  if (instance) return instance;
  instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    // The locale is resolved to an exact supported tag before init, so never probe
    // regional variants such as zh-Hans-CN against the resource set.
    load: 'currentOnly',
    supportedLngs: ['en', 'zh-Hans'],
    fallbackLng: 'en',
    // React already escapes interpolated values; a second pass would surface raw entities.
    interpolation: { escapeValue: false }
  });
  return instance;
}

export function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale;
}

type LanguageController = Pick<I18nInstance, 'language' | 'changeLanguage'>;

/**
 * Builds the handler for locale changes that originate outside the WebView, currently only the
 * native View menu. Unsupported payloads and repeats are ignored, so the round trip Rust
 * performs for a sidebar change cannot feed back into a second language change.
 */
export function createLocaleApplier(instance: LanguageController): (next: unknown) => void {
  return (next) => {
    if (!isSupportedLocale(next) || next === instance.language) return;
    void instance.changeLanguage(next);
    applyDocumentLocale(next);
  };
}

export { isSupportedLocale, resolveLocale, systemLocale, supportedLocales } from './locale.js';
export type { Locale };
