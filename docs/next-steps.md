# Next steps

## Implementation status

The product path has moved from an InDesign panel to a Tauri desktop app. The React interface, Rust file commands, HostJob v1 bridge, and UXP executor are implemented. The WebView is localized for `en` and `zh-Hans`; stable diagnostic codes are mapped through the catalogs, and the Chinese report is locale-independent. Template labels are optional: the desktop uses fuzzy role inference and publishes with warnings when it needs fallbacks. PDF and page previews are optional, while the staged nonempty INDD and Chinese report are required. The regenerated synthetic template passed a current HostJob smoke run on InDesign 21.0.0.192, including missing-image fallback, saved-document text verification, PDF export, and both page PNG exports. Representative end-to-end template acceptance through the packaged app remains open.

The remaining gate is full host-backed acceptance through the packaged app. Keep this list current as each case is exercised.

## Acceptance checklist

- [x] Tauri 2 + React + TypeScript workspace, valid ad-hoc signed macOS `.app`, and Apple Events metadata.
- [x] Markdown open/edit/save, automatic template inspection, preflight diagnostics, output selection, progress state, sparse previews, and open-output actions.
- [x] Rust creates isolated job/result files, runs generated top-level-await `.idjs` scripts, serializes jobs, enforces timeout, and checks result IDs and schema.
- [x] Earlier basic Synthetic Cover/Article template generation verified on InDesign 21.0.0.192.
- [x] Regenerate the ignored synthetic template and scan from the current probe before using it as host evidence.
- [x] Exercise the current resolver and UXP HostJob runner with the regenerated synthetic template and a missing image; verify a nonempty INDD, body text, inline warning frame, PDF, and both page PNGs.
- [x] Exercise the UXP HostJob runner directly with clear English names, fuzzy Chinese names, conflicting candidates, and a one-page template missing frames/styles; all four produced nonempty editable INDDs.
- [ ] Run a conventional labeled template, clear English names without labels, Chinese fuzzy names, conflicting candidates, and a one-page template with missing frames/styles through the packaged app; verify each creates a nonempty editable INDD.
- [ ] Run long Chinese/mixed-language content, missing images/fonts, image captions, and forced overflow; verify warnings and inline image notices while retaining the INDD.
- [ ] Force PDF and individual PNG export failures; verify successful optional files and the Chinese report remain available.
- [ ] Run missing-resource, unavailable-host, denied-permission, timeout, and damaged-result cases; confirm warnings preserve any usable INDD while hard failures never report empty output as success.
- [ ] Verify the first Apple Events permission prompt in the packaged app and inspect the built Info.plist.
- [x] Switch the packaged app to Simplified Chinese from the sidebar and from the View menu, reload, and confirm the stored locale drives the WebView and the menu checkmark; check CJK letter-spacing and leading in the sidebar, preflight, and preview panels.
- [x] Run `pnpm validate` and `pnpm desktop:build` after the implementation fixes.

## Known implementation constraints

Role labels, pages, frames, and styles are optional matching signals rather than publication requirements. Low-confidence matches and fallback-created frames appear in diagnostics and the report. Ordinary extra pages are omitted; an explicitly named or labeled Ending page is retained. Direct synthetic host coverage now exercises the automatic inference and best-effort output path across the five representative template shapes. Acceptance through the packaged app and real editorial templates remains a gate.

The UXP runner launches with macOS Apple Events. A first run may be denied in System Settings; the UI should surface that error. The signed, notarized distribution flow is not part of this first local build.

The UI translates diagnostic codes found in its locale catalogs and falls back to the original message for unknown codes. Raw Rust or UXP failures may still include English detail. The Chinese report uses the same catalog mapping with a Chinese explanation fallback.

## Deferred

- Real editorial template acceptance.
- Signed and notarized external distribution.
- InDesign Server and batch operation.
- Languages beyond `en` and `zh-Hans`; Traditional Chinese is not covered.
