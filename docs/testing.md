# Testing strategy

## Offline lane

Run:

```bash
pnpm validate
pnpm desktop:build
```

The default validation does not require Adobe software. TypeScript/Vitest cover Markdown fallback parsing, fuzzy role resolution, template compilation, page planning, diagnostics, reflow, deterministic host operations, and package boundaries. Rust tests cover AppleScript quoting, generated per-job scripts, result validation, file extensions, asset URL checks, and keeping required files when optional staged outputs are missing or partial.

The desktop build checks Vite output, Tauri configuration, the macOS bundle metadata, and the Apple Events usage description. On macOS, verify the built app bundle signature with:

```bash
codesign --verify --deep --strict "packages/desktop/src-tauri/target/release/bundle/macos/Folio.app"
```

The local build creates an ad-hoc signed `.app` and a DMG under `packages/desktop/src-tauri/target/release/bundle/dmg/`. Verify the DMG and inspect its installer contents:

```bash
hdiutil verify packages/desktop/src-tauri/target/release/bundle/dmg/*.dmg
```

Mount the DMG in Finder and confirm it contains `Folio.app` and the Applications folder alias. Copy Folio to Applications, launch the installed app, and verify its `Info.plist` contains `NSAppleEventsUsageDescription`. Exercise the first InDesign Automation permission flow when the macOS privacy state allows it; if the app is already authorized, verify the host version appears instead of resetting privacy permissions.

This local ad-hoc build does not include Developer ID signing or notarization. A successful build does not prove that InDesign accepts a job or that a real template composes correctly.

## InDesign host lane

Use InDesign 2026 on macOS and disposable templates. The ignored synthetic template and scan were regenerated from `packages/indesign/probes/synthetic-template-probe.idjs` during this implementation; regenerate them again after changing the fixture generator. The inline anchored-placeholder capability was verified separately by `packages/indesign/probes/inline-image-placeholder-probe.idjs` on InDesign 21.0.0.192. Host acceptance through the desktop app is still pending.

On 2026-09-27, the current resolver and UXP HostJob runner were exercised directly against the regenerated synthetic template with a missing image. InDesign produced a nonempty editable INDD, kept the missing image and caption text, placed an inline Chinese warning frame within the article page, passed the saved-document text check, and exported a PDF plus both page PNGs. This smoke run does not replace acceptance through the packaged app.

On 2026-09-28, the direct UXP HostJob runner also produced nonempty editable INDDs from four additional disposable templates: untagged English names, fuzzy Chinese names, conflicting frame/style candidates, and one page with no frames or custom styles. The one-page case includes an unused parent page and verifies Folio uses the document page for both output prototypes. These synthetic host runs do not replace acceptance through the packaged app or real editorial templates.

Run the packaged desktop app with at least these five template shapes and verify every case produces a nonempty editable INDD:

1. A conventional template with existing role labels.
2. A template without labels but with clear English names.
3. A template with Chinese names and fuzzy matches.
4. A template with multiple conflicting frames/styles and wrong-type candidates.
5. A one-page template with missing frames and styles.

Also verify:

- A basic article saves as INDD; PDF and all page previews are retained when their exports succeed.
- Long Chinese and mixed-language copy can trigger InDesign reflow; residual overflow and text differences appear as warnings.
- Available and missing images, captions, font substitution, and links are recorded without discarding the INDD. A missing image gets an inline warning frame when the host capability succeeds.
- PDF export and each PNG export can fail independently; only nonempty successful optional files appear in the output list and report.
- An unavailable InDesign host, denied Apple Events permission, timeout, damaged template, inaccessible output, empty INDD, or malformed HostJob produces an explicit failure and never treats an empty file as success.
- The packaged `.app` contains `NSAppleEventsUsageDescription`; launch it and complete the first control-InDesign permission flow.

Keep host artifacts under ignored `artifacts/host/`; do not commit user documents, templates, linked images, PDFs, or fonts.

## Contract details

Use the host job file as the input record and save the returned `HostJobResult v1`. Each job uses its own UUID directory. Verify Rust rejects a mismatched ID, unsupported version, malformed JSON, absent completion marker, and timeout. Run jobs serially because InDesign is not a concurrent rendering service.

The UXP script must use global/top-level `await` for file operations. Adobe documents `getEntryWithUrl` and local file URLs in the [UXP file system API](https://developer.adobe.com/indesign/uxp/uxp/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/) and top-level async scripts in [Global await](https://developer.adobe.com/indesign/uxp/scripts/concepts/global-await/). The corrected temporary file round trip was verified on InDesign 21.0.0.192 / DOM 21.0 / UXP 9.0.3-local.

## Document verification

The canonical dump records output page roles and order, story paragraphs and styles, semantic block IDs, resolved frame roles and bounds, overset, missing links, and font status. Exact text checks still run, but differences are warnings so Folio can deliver the editable document for review. InDesign owns composition and may substitute fonts or leave overset.

For PDF acceptance, compare exported page count with the InDesign document page count when a PDF exists. Raster review uses whatever nonempty per-page PNGs were produced for the same host version and installed fonts. Review visual baselines manually; they are outside the offline validation lane.
