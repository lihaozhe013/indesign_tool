// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';
import {
  isSupportedLocale,
  LOCALE_CHANGED_EVENT,
  resolveLocale,
  systemLocale,
  supportedLocales
} from './locale.js';

type Catalog = { [key: string]: string | Catalog };

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function isPluralSuffix(key: string): boolean {
  return PLURAL_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

function baseKey(key: string): string {
  return isPluralSuffix(key) ? key.slice(0, key.lastIndexOf('_')) : key;
}

function flatten(catalog: Catalog, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      flat.set(path, value);
      continue;
    }
    for (const [childPath, childValue] of flatten(value, path)) flat.set(childPath, childValue);
  }
  return flat;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1]!).sort();
}

function pluralVariants(flat: Map<string, string>, key: string): string[] {
  return [...flat.keys()].filter((candidate) => baseKey(candidate) === key).sort();
}

const enFlat = flatten(en as Catalog);
const zhFlat = flatten(zhHans as Catalog);
const enBaseKeys = new Set([...enFlat.keys()].map(baseKey));

// Entries that are deliberately identical to the English catalog because they are proper
// nouns or technology names rather than translatable prose.
const UNTRANSLATED_IN_CHINESE = new Set([
  'app.title', // The Folio product name is never translated.
  'app.editor.format', // The Markdown format name shown in the editor toolbar.
  'app.host.connected', // "InDesign" is the product name.
  'app.locale.en' // A locale lists itself in its own language, not in the target language.
]);

describe('locale catalogs', () => {
  it('keeps en as the source of truth for every base key', () => {
    expect(enBaseKeys.size).toBeGreaterThan(0);
    expect([...enBaseKeys].every((key) => !isPluralSuffix(key))).toBe(true);
  });

  it('defines the same base keys in every supported locale', () => {
    for (const locale of supportedLocales) {
      expect(flatten((locale === 'en' ? en : zhHans) as Catalog)).toBeDefined();
    }
    const zhBaseKeys = new Set([...zhFlat.keys()].map(baseKey));
    expect([...zhBaseKeys].sort()).toEqual([...enBaseKeys].sort());
  });

  it('resolves exactly one plural form per locale for every key', () => {
    for (const key of enBaseKeys) {
      const enVariants = pluralVariants(enFlat, key);
      const zhVariants = pluralVariants(zhFlat, key);
      expect(zhVariants, `zh-Hans is missing a form for ${key}`).toHaveLength(1);
      if (enVariants.length === 1) {
        expect(zhVariants, `zh-Hans must keep the single form of ${key}`).toEqual(enVariants);
      } else {
        // English separates singular from plural; Chinese has one form for all counts.
        expect(zhVariants, `zh-Hans should collapse ${key} to a single form`).toEqual([
          `${key}_other`
        ]);
      }
      for (const variant of enVariants) {
        if (isPluralSuffix(variant)) {
          expect(enVariants, `${key} needs an _other form to complete the plural set`).toContain(
            `${key}_other`
          );
        }
      }
    }
  });

  it('keeps interpolation placeholders identical across locales', () => {
    for (const [key, value] of enFlat) {
      for (const zhKey of pluralVariants(zhFlat, baseKey(key))) {
        expect(placeholders(zhFlat.get(zhKey)!), `placeholder mismatch at ${zhKey}`).toEqual(
          placeholders(value)
        );
      }
    }
  });

  it('leaves no translation blank', () => {
    for (const [key, value] of zhFlat) {
      expect(value.trim(), `zh-Hans is blank at ${key}`).not.toBe('');
    }
  });

  it('translates every Chinese entry', () => {
    for (const [key, value] of zhFlat) {
      if (UNTRANSLATED_IN_CHINESE.has(baseKey(key))) continue;
      expect(value, `zh-Hans still looks untranslated at ${key}`).toMatch(/[\u4e00-\u9fff]/);
    }
  });
});

describe('locale resolution', () => {
  it('maps Simplified Chinese tags onto zh-Hans', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hans-CN', 'zh-SG', 'ZH-HANS']) {
      expect(resolveLocale(tag), tag).toBe('zh-Hans');
    }
  });

  it('maps Traditional Chinese tags onto the English catalog', () => {
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant']) {
      expect(resolveLocale(tag), tag).toBe('en');
    }
  });

  it('falls back to English for other and missing tags', () => {
    for (const tag of ['en', 'en-GB', 'ja', 'fr-CA', '', undefined, null]) {
      expect(resolveLocale(tag)).toBe('en');
    }
  });

  it('rejects unsupported stored values', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('zh-Hans')).toBe(true);
    expect(isSupportedLocale('zh-Hant')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale(42)).toBe(false);
  });

  it('derives the system locale from the browser language list', () => {
    const original = navigator.languages;
    Object.defineProperty(navigator, 'languages', {
      value: ['ja-JP', 'zh-Hans-CN'],
      configurable: true
    });
    expect(systemLocale()).toBe('zh-Hans');
    Object.defineProperty(navigator, 'languages', { value: ['en-GB'], configurable: true });
    expect(systemLocale()).toBe('en');
    Object.defineProperty(navigator, 'languages', { value: original, configurable: true });
  });

  it('keeps the locale-changed event name aligned with the Rust menu bridge', () => {
    // The View menu notifies the WebView by event name, so a rename on either side would
    // silently stop the menu from working. The constant cannot be shared across the boundary.
    // Vitest runs from the workspace root, so resolve the Rust source from there.
    const rust = readFileSync(
      resolve(process.cwd(), 'packages/desktop/src-tauri/src/locale.rs'),
      'utf8'
    );
    const declared = /pub const LOCALE_CHANGED_EVENT: &str = "([^"]+)";/.exec(rust);
    expect(declared?.[1], 'Rust LOCALE_CHANGED_EVENT is missing').toBe(LOCALE_CHANGED_EVENT);
  });
});
