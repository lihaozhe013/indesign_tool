# Next steps

## Implementation status

The product path has moved from an InDesign panel to a Tauri desktop app. The React interface, Rust file commands, HostJob v1 bridge, and UXP executor are implemented. The synthetic template generator now includes the subtitle, link, and inline-image roles used by the app's fixtures; regenerate the template before host-backed acceptance. `pnpm validate` passes with 58 JavaScript/TypeScript tests and 14 Rust tests. `pnpm desktop:build` produces a valid ad-hoc signed macOS `.app` with its Apple Events usage string.

The remaining gate is full host-backed acceptance through the packaged app. Keep this list current as each case is exercised.

## Acceptance checklist

- [x] Tauri 2 + React + TypeScript workspace, valid ad-hoc signed macOS `.app`, and Apple Events metadata.
- [x] Markdown open/edit/save, role-labeled template inspection, preflight diagnostics, output selection, progress state, previews, and open-output actions.
- [x] Rust creates isolated job/result files, runs generated top-level-await `.idjs` scripts, serializes jobs, enforces timeout, and checks result IDs and schema.
- [x] Synthetic Cover/Article template generation verified on InDesign 21.0.0.192.
- [ ] Regenerate the synthetic template with the subtitle, link, and inline-image roles.
- [ ] Run basic article through the built `.app`; verify editable INDD, PDF, and per-page PNGs.
- [ ] Run long Chinese/mixed-language, image/caption, and forced-overflow articles; compare source text and output page count.
- [ ] Run missing-resource, unavailable-host, denied-permission, timeout, and damaged-result cases; confirm no partial final set remains.
- [ ] Verify the first Apple Events permission prompt in the packaged app and inspect the built Info.plist.
- [x] Run `pnpm validate` and `pnpm desktop:build` after the implementation fixes.

## Known implementation constraints

Only pre-labeled local templates are supported. The Cover page must provide a `hero-title` frame; Article needs one `article-flow` frame and the compiled style roles. Template role editing and real design-template acceptance are later milestones.

The UXP runner launches with macOS Apple Events. A first run may be denied in System Settings; the UI should surface that error. The signed, notarized distribution flow is not part of this first local build.

## Deferred

- Template-role mapping and annotation UI.
- Real editorial template acceptance.
- Signed and notarized external distribution.
- InDesign Server and batch operation.
