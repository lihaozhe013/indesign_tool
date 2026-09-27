# Next steps

## Implementation status

The product path has moved from an InDesign panel to a Tauri desktop app. The React interface, Rust file commands, HostJob v1 bridge, and UXP executor are implemented. The WebView interface is localized for `en` and `zh-Hans` with a stored locale preference. The synthetic template generator now declares the subtitle, link, and inline-image roles, but the ignored `.indd` and scan result were generated before that revision and omit those roles. Regenerate and inspect the current fixture before host-backed acceptance. `pnpm validate` passes with 69 JavaScript/TypeScript tests and 14 Rust tests. `pnpm desktop:build` produces a valid ad-hoc signed macOS `.app` with its Apple Events usage string.

The remaining gate is full host-backed acceptance through the packaged app. Keep this list current as each case is exercised.

## Acceptance checklist

- [x] Tauri 2 + React + TypeScript workspace, valid ad-hoc signed macOS `.app`, and Apple Events metadata.
- [x] Markdown open/edit/save, role-labeled template inspection, preflight diagnostics, output selection, progress state, previews, and open-output actions.
- [x] Rust creates isolated job/result files, runs generated top-level-await `.idjs` scripts, serializes jobs, enforces timeout, and checks result IDs and schema.
- [x] Earlier basic Synthetic Cover/Article template generation verified on InDesign 21.0.0.192.
- [ ] Regenerate the synthetic template from the current probe and verify `hero-subtitle`, `Subtitle`, `Link`, and `InlineImage` are present in the recorded role inventory.
- [ ] Run basic article through the built `.app`; verify editable INDD, PDF, and per-page PNGs.
- [ ] Run long Chinese/mixed-language, image/caption, and forced-overflow articles; compare source text and output page count.
- [ ] Run missing-resource, unavailable-host, denied-permission, timeout, and damaged-result cases; confirm no partial final set remains.
- [ ] Verify the first Apple Events permission prompt in the packaged app and inspect the built Info.plist.
- [ ] Switch the packaged app to Simplified Chinese, reload, and confirm the locale persists; check CJK letter-spacing and leading in the sidebar, preflight, and preview panels.
- [x] Run `pnpm validate` and `pnpm desktop:build` after the implementation fixes.

## Known implementation constraints

Only pre-labeled local templates are supported. The Cover page must provide a `hero-title` frame; Article needs one `article-flow` frame and the required `ArticleTitle`, `SectionHeading`, and `Body` styles. Articles with subtitles need a `hero-subtitle` frame. Text formatting roles used by an article—`Quote`, `Caption`, `Emphasis`, `Link`, and `Code`—must resolve to styles; subtitle and image-frame styles are applied when available. Template role editing and real design-template acceptance are later milestones.

The UXP runner launches with macOS Apple Events. A first run may be denied in System Settings; the UI should surface that error. The signed, notarized distribution flow is not part of this first local build.

The Chinese interface covers the WebView only. Diagnostic messages, Rust command errors, and UXP host errors are still English, so the preflight panel and any failure notice are mixed-language. Localizing them means keeping the English message in the contract and mapping `Diagnostic.code` to a catalog entry in the desktop package, per [ADR 0008](decisions/0008-ui-localization.md).

## Deferred

- Template-role mapping and annotation UI.
- Real editorial template acceptance.
- Signed and notarized external distribution.
- InDesign Server and batch operation.
- Diagnostic, Rust, and host error localization.
- Languages beyond `en` and `zh-Hans`; Traditional Chinese is not covered.
