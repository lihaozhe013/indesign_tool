# Testing strategy

## Offline lane

Run:

```bash
pnpm validate
pnpm desktop:build
```

The default validation does not require Adobe software. TypeScript/Vitest cover Markdown parsing, schema validation, template compilation, page planning, diagnostics, reflow, deterministic host operations, and package boundaries. Rust tests cover AppleScript quoting, generated per-job scripts, result validation, file extensions, asset URL checks, and staged output finalization.

The desktop build checks Vite output, Tauri configuration, the macOS bundle metadata, and the Apple Events usage description. On macOS, verify the built app bundle signature with:

```bash
codesign --verify --deep --strict "packages/desktop/src-tauri/target/release/bundle/macos/Structured Publisher.app"
```

The local build uses an ad-hoc signature; it does not prove that InDesign accepts a job or that a real template composes correctly.

## InDesign host lane

Use InDesign 2026 on macOS and a disposable synthetic template. The generator is `packages/indesign/probes/synthetic-template-probe.idjs`. Regenerate `artifacts/host/indesign-21.0.0.192/templates/synthetic-cover-article.indd` before testing: the current ignored `.indd` is non-empty, but it and its scan result predate the latest generator revision. The recorded role inventory omits `hero-subtitle`, `Subtitle`, `Link`, and `InlineImage`. Confirm the fresh inventory includes those roles (as well as `hero-title`, `hero-image`, `article-flow`, `Cover`, `Article`, and the other generated style roles) before using the fixture.

Run the desktop app and verify:

1. Template scan derives Cover, Article, `article-flow`, `hero-title`, and required paragraph styles from labels.
2. A basic article produces an editable INDD, a PDF, and one PNG preview per page.
3. Long Chinese and mixed Chinese/English text triggers InDesign overflow, adds pages, and retains every block and character after save/reopen.
4. A standalone image with a caption appears in the article and cover image frame; image links are present and captions retain their text.
5. A deliberately missing image is reported and staged files are discarded.
6. An absent InDesign host, denied Apple Events permission, a timed-out script, and a malformed result produce explicit errors and no final deliverables.
7. The packaged `.app` contains `NSAppleEventsUsageDescription`; launch it and complete the first control-InDesign permission flow.

Keep host artifacts under ignored `artifacts/host/`; do not commit user documents, templates, linked images, PDFs, or fonts.

## Contract details

Use the host job file as the input record and save the returned `HostJobResult v1`. Each job uses its own UUID directory. Verify Rust rejects a mismatched ID, unsupported version, malformed JSON, absent completion marker, and timeout. Run jobs serially because InDesign is not a concurrent rendering service.

The UXP script must use global/top-level `await` for file operations. Adobe documents `getEntryWithUrl` and local file URLs in the [UXP file system API](https://developer.adobe.com/indesign/uxp/uxp/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/) and top-level async scripts in [Global await](https://developer.adobe.com/indesign/uxp/scripts/concepts/global-await/). The corrected temporary file round trip was verified on InDesign 21.0.0.192 / DOM 21.0 / UXP 9.0.3-local.

## Document verification

The canonical dump records page roles and order, story paragraphs and styles, semantic block IDs, labeled frame roles and bounds, overset, missing links, and font status. Keep text checks exact for non-image paragraphs. InDesign owns composition and may produce font warnings; a font warning is visible but does not silently become a layout failure.

For PDF acceptance, compare exported page count with the InDesign document page count. Raster review uses the per-page PNGs from the same host version and installed font set. Visual baselines remain separate from normal CI.
