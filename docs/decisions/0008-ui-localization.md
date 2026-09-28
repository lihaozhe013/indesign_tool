# ADR 0008: Desktop UI localization

## Status

Accepted

## Context

The desktop interface was written with English literals in JSX. Chinese publishers are a
first-release audience, and the acceptance plan already calls for long Chinese and mixed-language
articles, so the surrounding interface has to be readable in the same language as the content.

User-visible text is not confined to the React WebView. It appears at four layers:

1. Interface literals in `packages/desktop/src/App.tsx`.
2. Diagnostic messages produced by `contracts`, `core`, and `template` and persisted in
   `HostJobResult` files.
3. Error strings returned by Rust Tauri commands in `src-tauri/src/lib.rs` and
   `src-tauri/src/host_bridge.rs`.
4. Error strings thrown inside `packages/indesign/src/host-runner.idjs` while running inside
   InDesign.

Only the first layer is under the WebView's control. The other three are produced by packages that
are required to stay free of Node, Tauri, UXP, and InDesign dependencies, and layer 2 in particular
is part of a versioned persisted representation described in [ADR 0002](0002-document-ir.md) and
[ADR 0004](0004-desktop-host-transport.md).

The language control also has to exist in two places: the sidebar and the macOS menu bar.

## Decision

Localize the interface layer only, for `en` and `zh-Hans`, using `i18next` and `react-i18next` with
plain JSON resources and no build-time extraction plugin.

`packages/desktop/src/i18n/locales/en.json` is the source of truth. `zh-Hans.json` must carry the
same key set. Progress status is stored as a key plus interpolation values rather than a rendered
string, so switching language repaints in-flight status instead of leaving it frozen in the previous
locale.

**Rust owns the locale preference; the WebView owns the rendered language.** The stored preference
lives in `settings.json` through `tauri-plugin-store` on the Rust side, and the language check items
are native View menu items. Rust persists the choice, moves the checkmark, and notifies the WebView
with a `locale-changed` event. The sidebar switch and the menu item are two controls for the same
single-writer path. A stored preference wins, then the browser language list, then English; on a
first run the WebView writes its resolved value back so the menu matches. The event name is
duplicated across the language boundary and a test asserts the two declarations agree.

The interface layer and recognized diagnostic codes are localized at the desktop boundary.
Diagnostic source messages, Rust command errors, and raw UXP host errors remain English so shared
packages stay independent from locale catalogs. The desktop maps stable `Diagnostic.code` values to
catalog entries and uses the original English message when no mapping exists. The Chinese
publication report uses the same mapping with a Chinese explanation fallback.

The Folio product name, the InDesign product name, the Markdown format name, and the native bundle
and window titles are never translated.

## Rationale

Runtime resources with no extraction plugin keep the build pipeline unchanged and make a missing
translation a test failure rather than a build error. English plural forms are resolved through the
i18next plural suffix scheme; Chinese has a single form, and the catalog test asserts that collapse
explicitly.

Reading the locale from the desktop package keeps the translation boundary at the edge of the
application. `core`, `template`, and `contracts` stay host-independent and their persisted output
stays byte-stable across locales, so a job result written under one UI language remains valid under
another.

Rust owning the preference follows the existing split where Rust owns local files, and it is forced
by the menu bar. A native check item has to be correct before any script runs, and the WebView
cannot observe the system language from Rust. Letting both sides write `settings.json` would allow
the menu and the rendered text to disagree. Keeping one writer and one event makes the sidebar and
the menu two views of a single value. The menu is extended rather than replaced, because a
hand-built menu bar would risk dropping the Edit accelerators the Markdown editor depends on.

## Consequences

- The desktop package gains `i18next` and `react-i18next` as runtime dependencies, and
  `tauri-plugin-store` as a Rust-only dependency. There is no JavaScript store client, so the
  capability file grants only `core:default`.
- `src-tauri/src/locale.rs` owns the supported locale list, which now exists in both Rust and
  TypeScript. Rust is authoritative for storage and the menu; TypeScript is authoritative for what
  the WebView renders.
- The View menu extends the Tauri default menu and is looked up by title, so a change to the default
  menu layout would break `attach_menu_items`.
- Unknown diagnostic codes and raw Rust or host failures may include English details in the Chinese
  interface.
- `index.html` and the Tauri window title are static English; only `document.title` is reassigned
  from the catalog after startup.
- A new language is a new JSON file, a new entry in `supportedLocales`, and a matching branch in the
  Rust locale module.
- Traditional Chinese is not supported. It resolves to English rather than to simplified text, which
  would be wrong.
- Outside the Tauri shell, such as in unit tests or a browser preview, persistence is best effort
  and the preference stays in memory.

## References

- [i18next](https://www.i18next.com/)
- [react-i18next](https://react.i18next.com/)
- [Tauri menu](https://v2.tauri.app/learn/window-menu/)
- [Tauri events](https://v2.tauri.app/develop/calling-rust/#communication-between-frontend-and-backend)
- [Tauri store plugin](https://v2.tauri.app/plugin/store/)
- [Pluralization](https://www.i18next.com/translation-function/plurals)
- [CLDR plural rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)
