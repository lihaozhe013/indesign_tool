// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createLocaleApplier } from './index.js';

type Controller = {
  language: string;
  changeLanguage: (next: string) => Promise<unknown>;
  changes: string[];
};

function controller(language: string): Controller {
  const state = { language, changes: [] as string[] };
  return {
    get language() {
      return state.language;
    },
    async changeLanguage(next: string) {
      state.changes.push(next);
      state.language = next;
      return next;
    },
    get changes() {
      return state.changes;
    }
  };
}

describe('locale applier', () => {
  it('applies a supported locale and syncs the document language', () => {
    const instance = controller('en');
    document.documentElement.lang = 'en';
    createLocaleApplier(instance)('zh-Hans');
    expect(instance.changes).toEqual(['zh-Hans']);
    expect(document.documentElement.lang).toBe('zh-Hans');
  });

  it('ignores a repeated locale so a Rust round trip cannot loop', () => {
    const instance = controller('zh-Hans');
    createLocaleApplier(instance)('zh-Hans');
    expect(instance.changes).toEqual([]);
  });

  it('ignores unsupported and malformed payloads from the event channel', () => {
    const instance = controller('en');
    document.documentElement.lang = 'en';
    const apply = createLocaleApplier(instance);
    for (const payload of ['zh-Hant', 'ja', '', null, undefined, 42, { locale: 'zh-Hans' }]) {
      apply(payload);
    }
    expect(instance.changes).toEqual([]);
    expect(document.documentElement.lang).toBe('en');
  });
});
