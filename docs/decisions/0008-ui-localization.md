# ADR 0008: Desktop UI localization

## Status

Accepted

## Context

The desktop interface was written with English literals in JSX. Chinese publishers are a first-release audience, and the acceptance plan already calls for long Chinese and mixed-language articles, so the surrounding interface has to be readable in the same language as the content.

User-visible text is not confined to the React WebView. It appears at four layers:

1. Interface literals in `packages/desktop/src/App.tsx`.
2. Diagnostic messages produced by `contracts`, `core`, and `template` and persisted in `HostJobResult` files.
3. Error strings returned by Rust Tauri commands in `src-tauri/src/lib.rs` and `src-tauri/src/host_bridge.rs`.
4. Error strings thrown inside `packages/indesign/src/host-runner.idjs` while running inside InDesign.

Only the first layer is under the WebView's control. The other three are produced by packages that are required to stay free of Node, Tauri, UXP, and InDesign dependencies, and layer 2 in particular is part of a versioned persisted representation described in [ADR 0002](0002-document-ir.md) and [ADR 0004](0004-desktop-host-transport.md).

## Decision

Localize the interface layer only, for `en` and `zh-Hans`, using `i18next` and `react-i18next` with plain JSON resources and no build-time extraction plugin.

`packages/desktop/src/i18n/locales/en.json` is the source of truth. `zh-Hans.json` must carry the same key set. Progress status is stored as a key plus interpolation values rather than a rendered string, so switching language repaints in-flight status instead of leaving it frozen in the previous locale.

Locale selection is explicit: a stored preference wins, then the browser language list, then English. The preference is persisted with `@tauri-apps/plugin-store` in `settings.json` rather than `localStorage`, because a user preference should outlive WebView data eviction and because Rust already owns local file placement.

Diagnostic text, Rust command errors, and UXP host errors stay English. This is a deliberate boundary, not an oversight. If these are localized later, the correct route is to keep the English message in the contract and map `Diagnostic.code` to a catalog entry in the desktop package, rather than making `core` or `template` depend on a translation catalog.

The Folio product name, the InDesign product name, the Markdown format name, and the native bundle and window titles are never translated.

## Rationale

Runtime resources with no extraction plugin keep the build pipeline unchanged and make a missing translation a test failure rather than a build error. English plural forms are resolved through the i18next plural suffix scheme; Chinese has a single form, and the catalog test asserts that collapse explicitly.

Reading the locale from the desktop package keeps the translation boundary at the edge of the application. `core`, `template`, and `contracts` stay host-independent and their persisted output stays byte-stable across locales, so a job result written under one UI language remains valid under another.

Storing the locale on disk rather than in `localStorage` means the choice survives a WebView data reset, which matters because the locale is a user preference and not a cache.

## Consequences

- The desktop package gains `i18next`, `react-i18next`, and `@tauri-apps/plugin-store` as runtime dependencies, and `tauri-plugin-store` as a Rust dependency.
- `src-tauri/capabilities/default.json` grants `store:default`; the window carries an explicit `main` label so the capability matches.
- A Chinese interface is mixed-language: the preflight diagnostics list and any Rust or host failure still render English text.
- `index.html`, the Tauri window title, and the bundle `productName` remain static English; only `document.title` is reassigned from the catalog after startup.
- A new language is a new JSON file plus an entry in `supportedLocales` and in `pnpm-workspace.yaml` if a release-age gate is later enabled.
- Traditional Chinese is not supported. It resolves to English rather than to simplified text, which would be wrong.
- The locale store is best effort. Outside the Tauri shell, such as in unit tests or a browser preview, the preference silently stays in memory.

## References

- [i18next](https://www.i18next.com/)
- [react-i18next](https://react.i18next.com/)
- [Tauri store plugin](https://v2.tauri.app/plugin/store/)
- [Pluralization](https://www.i18next.com/translation-function/plurals)
- [CLDR plural rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)
