export const supportedLocales = ["en", "zh-Hans"] as const;

export type Locale = (typeof supportedLocales)[number];

/** Must match the event name emitted by the Rust locale module. */
export const LOCALE_CHANGED_EVENT = "locale-changed";

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (supportedLocales as readonly string[]).includes(value);
}

/**
 * Collapses any BCP 47 tag onto a supported locale. Traditional Chinese tags fall
 * back to English because the product ships a single simplified Chinese catalog.
 */
export function resolveLocale(candidate: string | undefined | null): Locale {
  const tag = (candidate ?? "").trim().toLowerCase();
  if (tag.startsWith("zh")) return /hant|tw|hk|mo/.test(tag) ? "en" : "zh-Hans";
  return "en";
}

export function systemLocale(): Locale {
  const candidates = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  for (const candidate of candidates) {
    if (candidate?.toLowerCase().startsWith("zh")) return resolveLocale(candidate);
  }
  return "en";
}
